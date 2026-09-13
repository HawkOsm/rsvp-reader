/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.NumberFormat

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { RsvpTheme { App() } }
    }
}

private val nf: NumberFormat = NumberFormat.getIntegerInstance()

@Composable
fun App(vm: ReaderViewModel = viewModel()) {
    val context = LocalContext.current
    val activity = context as? Activity

    // Keep the screen awake while words are flashing.
    LaunchedEffect(vm.playing) {
        val window = activity?.window ?: return@LaunchedEffect
        if (vm.playing) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        // Persist access, or the file becomes unreadable after a restart.
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        }
        val name = context.displayName(uri)
        val type = context.contentResolver.getType(uri).orEmpty()
        vm.add(uri, name, type.contains("pdf") || name.endsWith(".pdf", true))
    }

    Surface(Modifier.fillMaxSize(), color = Bg) {
        when (vm.screen) {
            Screen.LIBRARY -> LibraryScreen(vm) {
                picker.launch(arrayOf("application/pdf", "text/*"))
            }
            Screen.READER -> {
                BackHandler { vm.closeBook() }
                ReaderScreen(vm)
            }
        }
    }

    vm.busy?.let { Dialog(it, null) }
    vm.resumeAsk?.let { target ->
        val percent = (target.progress * 100).toInt()
        AlertDialog(
            onDismissRequest = { vm.answerResume(false) },
            title = { Text("Resume?") },
            text = {
                Text(
                    "You were at word ${nf.format(target.lastIndex)} of " +
                        "${nf.format(target.totalWords)} ($percent%)."
                )
            },
            confirmButton = { TextButton({ vm.answerResume(true) }) { Text("Resume") } },
            dismissButton = { TextButton({ vm.answerResume(false) }) { Text("Start over") } },
        )
    }
    vm.message?.let { text ->
        AlertDialog(
            onDismissRequest = { vm.message = null },
            title = { Text("Sorry") },
            text = { Text(text) },
            confirmButton = { TextButton({ vm.message = null }) { Text("OK") } },
        )
    }
}

@Composable
private fun Dialog(text: String, onDismiss: (() -> Unit)?) {
    AlertDialog(
        onDismissRequest = { onDismiss?.invoke() },
        title = { Text("Working") },
        text = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Accent)
                Spacer(Modifier.width(14.dp))
                Text(text)
            }
        },
        confirmButton = {},
    )
}

// ------------------------------------------------------------- library

@Composable
private fun LibraryScreen(vm: ReaderViewModel, onAdd: () -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().background(Raised).padding(16.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Library", fontSize = 20.sp, fontWeight = FontWeight.Bold,
                color = TextCol, modifier = Modifier.weight(1f))
            Button(onAdd, colors = ButtonDefaults.buttonColors(containerColor = Accent)) {
                Text("Add")
            }
        }

        if (vm.books.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text(
                    "Nothing here yet.\nTap Add to pick a PDF or text file.\n\n" +
                        "Files stay on this device.",
                    color = DimCol, textAlign = TextAlign.Center,
                )
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(vm.books, key = { it.id }) { b ->
                    BookRow(b, onOpen = { vm.open(b.id) }, onRemove = { vm.remove(b.id) })
                    HorizontalDivider(color = BorderCol)
                }
            }
        }
    }
}

@Composable
private fun BookRow(b: Book, onOpen: () -> Unit, onRemove: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (b.kind == "pdf") "PDF" else "TXT",
            fontSize = 11.sp, fontWeight = FontWeight.Bold, color = DimCol,
            modifier = Modifier.background(Raised, MaterialTheme.shapes.small)
                .padding(6.dp, 4.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(b.title, color = TextCol, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (b.totalWords > 0) "${nf.format(b.totalWords)} words" else "not opened yet",
                color = DimCol, fontSize = 13.sp,
            )
        }
        if (b.lastIndex > 0 && b.totalWords > 0) {
            Text("${(b.progress * 100).toInt()}%", color = Accent, fontSize = 12.sp,
                fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
        }
        TextButton({ confirm = true }) { Text("×", color = DimCol, fontSize = 20.sp) }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Remove this book?") },
            text = { Text("${b.title} and your place in it will be forgotten. " +
                "The file itself is not touched.") },
            confirmButton = {
                TextButton({ confirm = false; onRemove() }) { Text("Remove") }
            },
            dismissButton = { TextButton({ confirm = false }) { Text("Cancel") } },
        )
    }
}

// -------------------------------------------------------------- reader

@Composable
private fun ReaderScreen(vm: ReaderViewModel) {
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().background(Raised).padding(8.dp, 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton({ vm.closeBook() }) { Text("‹ Library", color = TextCol) }
            Text(
                vm.book?.title.orEmpty(), color = TextCol, fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (vm.book?.kind == "pdf") {
                TextButton({ vm.togglePage() }) {
                    Text(if (vm.showPage) "Word" else "Page", color = TextCol)
                }
            } else {
                Spacer(Modifier.width(72.dp))
            }
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (vm.showPage) {
                val bitmap = vm.pageBitmap
                if (bitmap != null) {
                    Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                        Image(
                            bitmap.asImageBitmap(), contentDescription = "Page",
                            modifier = Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth,
                        )
                    }
                } else {
                    Box(Modifier.fillMaxSize(), Alignment.Center) {
                        CircularProgressIndicator(color = Accent)
                    }
                }
            } else {
                WordCanvas(vm.token?.text.orEmpty(), Modifier.fillMaxSize())
                // Tap zones: left steps back, middle plays, right steps on.
                Row(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(0.28f).fillMaxHeight().clickable { vm.skip(-1) })
                    Box(Modifier.weight(0.44f).fillMaxHeight().clickable { vm.toggle() })
                    Box(Modifier.weight(0.28f).fillMaxHeight().clickable { vm.skip(1) })
                }
            }
        }

        Column(Modifier.fillMaxWidth().background(Raised).padding(16.dp, 10.dp)) {
            ScrubBar(vm)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    { vm.toggle() },
                    colors = ButtonDefaults.buttonColors(containerColor = Accent),
                    modifier = Modifier.width(110.dp),
                ) { Text(if (vm.playing) "Pause" else "Play") }
                Spacer(Modifier.width(12.dp))
                val page = vm.token?.takeIf { it.hasPlace }?.let { " · p${it.page + 1}" }.orEmpty()
                Text(
                    "${nf.format(vm.index + 1)} / ${nf.format(vm.count)} · " +
                        "${(vm.progress * 100).toInt()}%$page",
                    color = DimCol, fontSize = 13.sp, textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("WPM", color = DimCol, fontSize = 13.sp)
                Slider(
                    value = vm.wpm.toFloat(),
                    onValueChange = { vm.setWpm(it.toInt()) },
                    valueRange = Rsvp.MIN_WPM.toFloat()..Rsvp.MAX_WPM.toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = Accent, activeTrackColor = Accent,
                        inactiveTrackColor = BorderCol,
                    ),
                    modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                )
                Text("${vm.wpm}", color = TextCol, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun ScrubBar(vm: ReaderViewModel) {
    var width by remember { mutableStateOf(1f) }
    Box(
        Modifier.fillMaxWidth().height(24.dp)
            .pointerInput(vm.count) {
                width = size.width.toFloat()
                detectHorizontalDragGestures { change, _ ->
                    val fraction = (change.position.x / width).coerceIn(0f, 1f)
                    if (vm.count > 0) vm.seek((fraction * (vm.count - 1)).toInt())
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(Modifier.fillMaxWidth().height(4.dp).background(BorderCol))
        Box(Modifier.fillMaxWidth(vm.progress.coerceIn(0f, 1f)).height(4.dp).background(Accent))
    }
}

private fun android.content.Context.displayName(uri: Uri): String {
    contentResolver.query(uri, null, null, null, null)?.use { c ->
        val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (i >= 0 && c.moveToFirst()) return c.getString(i)
    }
    return uri.lastPathSegment ?: "Document"
}
