/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import android.app.Application
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Which screen is showing. */
enum class Screen { LIBRARY, READER }

/**
 * A rendered page, kept with the page's size in PDF points.
 *
 * Both numbers are needed: word rectangles are in points, the bitmap is in
 * pixels, and the view draws at a third size again, so the ratio between
 * them is what lets a tap find the word under a finger.
 */
data class PageImage(
    val bitmap: Bitmap,
    val pageNo: Int,
    val pointWidth: Float,
    val pointHeight: Float,
)

/** How far off a word a tap may land and still select it, in points. */
private const val TAP_SLACK = 14f

/**
 * All of the app's state.  Playback is a coroutine rather than a timer:
 * it sleeps for each word's own delay, so the pacing rules apply exactly
 * as they do on the desktop.
 */
class ReaderViewModel(app: Application) : AndroidViewModel(app) {

    private val library = Library(app)

    var screen by mutableStateOf(Screen.LIBRARY)
        private set
    var books by mutableStateOf<List<Book>>(emptyList())
        private set
    var book by mutableStateOf<Book?>(null)
        private set
    var tokens by mutableStateOf<List<Token>>(emptyList())
        private set
    var index by mutableStateOf(0)
        private set
    var wpm by mutableStateOf(Rsvp.DEFAULT_WPM)
        private set
    var playing by mutableStateOf(false)
        private set
    var busy by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
    var resumeAsk by mutableStateOf<Book?>(null)
    var showPage by mutableStateOf(false)
        private set
    var pageImage by mutableStateOf<PageImage?>(null)
        private set
    var pdfPageCount by mutableStateOf(0)
        private set

    /** page -> the words on it, so a tap can be matched to one. */
    private var wordsByPage: Map<Int, List<Pair<Int, FloatArray>>> = emptyMap()
    /** page -> index of its first word, for page turning. */
    private var firstWordOfPage: Map<Int, Int> = emptyMap()

    private var job: Job? = null
    private var unsaved = 0

    val token: Token? get() = tokens.getOrNull(index)
    val count: Int get() = tokens.size
    val progress: Float get() = if (tokens.isEmpty()) 0f else index.toFloat() / tokens.size

    init {
        PDFBoxResourceLoader.init(app)
        refresh()
    }

    fun refresh() {
        viewModelScope.launch(Dispatchers.IO) {
            val list = library.listBooks()
            withContext(Dispatchers.Main) { books = list }
        }
    }

    // ------------------------------------------------------------ books

    fun add(uri: Uri, displayName: String, isPdf: Boolean) {
        viewModelScope.launch(Dispatchers.IO) {
            val title = displayName.substringBeforeLast('.', displayName)
            val added = library.addBook(uri.toString(), title, if (isPdf) "pdf" else "txt")
            withContext(Dispatchers.Main) { books = library.listBooks() }
            open(added.id)
        }
    }

    fun resetProgress(id: Long) {
        viewModelScope.launch(Dispatchers.IO) {
            library.resetProgress(id)
            val list = library.listBooks()
            withContext(Dispatchers.Main) {
                books = list
                if (book?.id == id) seek(0)
            }
        }
    }

    fun remove(id: Long) {
        viewModelScope.launch(Dispatchers.IO) {
            library.removeBook(id)
            val list = library.listBooks()
            withContext(Dispatchers.Main) { books = list }
        }
    }

    fun open(id: Long) {
        viewModelScope.launch(Dispatchers.IO) {
            val target = library.getBook(id) ?: return@launch
            var loaded = library.loadTokens(id)
            if (loaded.isEmpty()) {
                withContext(Dispatchers.Main) { busy = "Reading ${target.title}…" }
                loaded = try {
                    parse(target)
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        busy = null
                        message = "Could not read this file: ${e.message}"
                    }
                    return@launch
                }
                if (loaded.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        busy = null
                        message = "No readable text found. A scanned PDF needs OCR first."
                    }
                    return@launch
                }
                library.saveTokens(id, loaded)
            }
            val fresh = library.getBook(id)!!
            val byPage = loaded.withIndex()
                .filter { it.value.hasPlace }
                .groupBy({ it.value.page }, { it.index to it.value.bbox!! })
            val firsts = byPage.mapValues { (_, words) -> words.minOf { it.first } }
            val pages = runCatching { pageCountOf(target) }.getOrDefault(0)

            withContext(Dispatchers.Main) {
                busy = null
                book = fresh
                tokens = loaded
                wordsByPage = byPage
                firstWordOfPage = firsts
                pdfPageCount = pages
                index = 0
                unsaved = 0
                showPage = false
                pageImage = null
                screen = Screen.READER
                if (fresh.lastIndex > 0 && fresh.lastIndex < fresh.totalWords - 1) {
                    resumeAsk = fresh
                }
            }
        }
    }

    private fun parse(target: Book): List<Token> {
        val resolver = getApplication<Application>().contentResolver
        val uri = Uri.parse(target.uri)
        return if (target.kind == "pdf") {
            resolver.openInputStream(uri).use { stream ->
                PDDocument.load(stream).use { doc -> PdfText.extract(doc) }
            }
        } else {
            resolver.openInputStream(uri).use { stream ->
                Tokenizer.tokenizeText(stream!!.readBytes().toString(Charsets.UTF_8))
            }
        }
    }

    fun answerResume(resume: Boolean) {
        val target = resumeAsk ?: return
        resumeAsk = null
        seek(if (resume) target.lastIndex else 0)
    }

    fun closeBook() {
        pause()
        flush()
        book = null
        tokens = emptyList()
        pageImage = null
        wordsByPage = emptyMap()
        firstWordOfPage = emptyMap()
        pdfPageCount = 0
        screen = Screen.LIBRARY
        refresh()
    }

    // -------------------------------------------------------- playback

    // Not named setWpm: the `wpm` property already generates that on the JVM.
    fun changeWpm(value: Int) { wpm = value.coerceIn(Rsvp.MIN_WPM, Rsvp.MAX_WPM) }

    fun toggle() = if (playing) pause() else play()

    fun play() {
        if (tokens.isEmpty() || playing) return
        if (index >= tokens.lastIndex) seek(0)
        playing = true
        job = viewModelScope.launch {
            while (isActive && index < tokens.lastIndex) {
                delay(Rsvp.delayFor(tokens[index], wpm).roundToInt().toLong())
                if (!isActive) break
                index += 1
                onIndexChanged()
            }
            playing = false
            flush()
        }
    }

    fun pause() {
        job?.cancel()
        job = null
        if (playing) { playing = false; flush() }
    }

    fun seek(target: Int) {
        if (tokens.isEmpty()) return
        index = target.coerceIn(0, tokens.lastIndex)
        onIndexChanged()
    }

    fun skip(delta: Int) = seek(index + delta)

    private fun onIndexChanged() {
        unsaved += 1
        if (unsaved >= SAVE_EVERY) flush()
        if (showPage) renderPage()
    }

    private fun flush() {
        val current = book ?: return
        val at = index
        unsaved = 0
        viewModelScope.launch(Dispatchers.IO) { library.updateProgress(current.id, at) }
    }

    // ------------------------------------------------------- page view

    /**
     * Switch between one word at a time and reading the document normally.
     *
     * For a PDF that means its real page; for a text file, which has no
     * pages, it means the reflowed view.
     */
    fun togglePage() {
        showPage = !showPage
        pause()
        if (showPage && book?.kind == "pdf") renderPage() else pageImage = null
    }

    /** The page currently on screen, which may be ahead of the word. */
    val shownPage: Int get() = pageImage?.pageNo ?: token?.page ?: 0

    val canPageBack: Boolean get() = showPage && shownPage > 0
    val canPageOn: Boolean get() = showPage && shownPage < pdfPageCount - 1

    /**
     * Turn to the next or previous page, taking the reading position with
     * it - the same as the desktop's page buttons, so switching back to the
     * word view carries on from what you are looking at.
     */
    fun turnPage(delta: Int) {
        val target = (shownPage + delta).coerceIn(0, maxOf(0, pdfPageCount - 1))
        if (target == shownPage) return
        val first = firstWordOfPage[target]
        if (first != null) {
            seek(first)                 // renders the page via onIndexChanged
        } else {
            renderPage(target)          // a page with no extractable text
        }
    }

    /**
     * Start reading from the word under a tap.
     *
     * [x] and [y] are in PDF points. A tap inside a word wins outright;
     * otherwise the nearest word within [TAP_SLACK] is taken, so hitting
     * the gap between two words still does something sensible.
     */
    fun seekToPoint(x: Float, y: Float) {
        val words = wordsByPage[shownPage] ?: return
        var best: Int? = null
        var bestDistance = Float.MAX_VALUE
        for ((tokenIndex, box) in words) {
            if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) {
                best = tokenIndex
                break
            }
            val dx = maxOf(box[0] - x, 0f, x - box[2])
            val dy = maxOf(box[1] - y, 0f, y - box[3])
            val distance = kotlin.math.sqrt(dx * dx + dy * dy)
            if (distance <= TAP_SLACK && distance < bestDistance) {
                bestDistance = distance
                best = tokenIndex
            }
        }
        best?.let { seek(it) }
    }

    private fun renderPage(pageNo: Int = -1) {
        val current = book ?: return
        if (current.kind != "pdf") return
        val wanted = if (pageNo >= 0) pageNo else token?.takeIf { it.hasPlace }?.page ?: return
        if (pageImage?.pageNo == wanted) return          // already showing it
        viewModelScope.launch(Dispatchers.IO) {
            val rendered = runCatching { renderPdfPage(current, wanted) }.getOrNull()
            withContext(Dispatchers.Main) { if (rendered != null) pageImage = rendered }
        }
    }

    private fun pageCountOf(target: Book): Int {
        if (target.kind != "pdf") return 0
        val resolver = getApplication<Application>().contentResolver
        val fd = resolver.openFileDescriptor(Uri.parse(target.uri), "r") ?: return 0
        fd.use { PdfRenderer(it).use { renderer -> return renderer.pageCount } }
    }

    private fun renderPdfPage(target: Book, pageNo: Int): PageImage? {
        val resolver = getApplication<Application>().contentResolver
        val fd: ParcelFileDescriptor =
            resolver.openFileDescriptor(Uri.parse(target.uri), "r") ?: return null
        fd.use {
            PdfRenderer(it).use { renderer ->
                if (pageNo !in 0 until renderer.pageCount) return null
                renderer.openPage(pageNo).use { page ->
                    val width = 1400
                    val height = (width * page.height.toFloat() / page.width).toInt()
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(android.graphics.Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    // getWidth/getHeight are points at 72dpi, the same unit
                    // PDFBox reports word rectangles in.
                    return PageImage(
                        bitmap, pageNo, page.width.toFloat(), page.height.toFloat()
                    )
                }
            }
        }
    }

    override fun onCleared() {
        pause()
        library.close()
        super.onCleared()
    }
}
