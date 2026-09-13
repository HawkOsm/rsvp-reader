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
    var pageBitmap by mutableStateOf<Bitmap?>(null)
        private set

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
            withContext(Dispatchers.Main) {
                busy = null
                book = fresh
                tokens = loaded
                index = 0
                unsaved = 0
                showPage = false
                pageBitmap = null
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
        pageBitmap = null
        screen = Screen.LIBRARY
        refresh()
    }

    // -------------------------------------------------------- playback

    fun setWpm(value: Int) { wpm = value.coerceIn(Rsvp.MIN_WPM, Rsvp.MAX_WPM) }

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

    fun togglePage() {
        showPage = !showPage
        if (showPage) renderPage() else pageBitmap = null
    }

    private fun renderPage() {
        val current = book ?: return
        val place = token ?: return
        if (current.kind != "pdf" || !place.hasPlace) return
        viewModelScope.launch(Dispatchers.IO) {
            val bitmap = runCatching { renderPdfPage(current, place.page) }.getOrNull()
            withContext(Dispatchers.Main) { pageBitmap = bitmap }
        }
    }

    private fun renderPdfPage(target: Book, pageNo: Int): Bitmap? {
        val resolver = getApplication<Application>().contentResolver
        val fd: ParcelFileDescriptor =
            resolver.openFileDescriptor(Uri.parse(target.uri), "r") ?: return null
        fd.use {
            PdfRenderer(it).use { renderer ->
                if (pageNo !in 0 until renderer.pageCount) return null
                renderer.openPage(pageNo).use { page ->
                    val width = 1200
                    val height = (width * page.height.toFloat() / page.width).toInt()
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(android.graphics.Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    return bitmap
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
