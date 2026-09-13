/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * The library, in SQLite.  Mirrors db.py's schema.
 *
 * A book is identified by a content URI rather than a path, because that
 * is what Android's file picker returns; persistable permission is taken
 * on it so the file stays readable after a restart.
 */
data class Book(
    val id: Long,
    val uri: String,
    val title: String,
    val kind: String,          // "pdf" or "txt"
    val totalWords: Int,
    val lastIndex: Int,
    val lastOpenedAt: Long?,
    val addedAt: Long,
) {
    val progress: Float
        get() = if (totalWords <= 0) 0f
        else minOf(1f, lastIndex.toFloat() / totalWords)
}

/** Write progress at most this often, matching the other versions. */
const val SAVE_EVERY = 20

class Library(context: Context) : SQLiteOpenHelper(context, NAME, null, VERSION) {

    companion object {
        private const val NAME = "library.db"
        private const val VERSION = 1
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE books (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                uri            TEXT    NOT NULL UNIQUE,
                title          TEXT    NOT NULL,
                kind           TEXT    NOT NULL,
                total_words    INTEGER NOT NULL DEFAULT 0,
                last_index     INTEGER NOT NULL DEFAULT 0,
                last_opened_at INTEGER,
                added_at       INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE tokens (
                book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                idx      INTEGER NOT NULL,
                text     TEXT    NOT NULL,
                para_end INTEGER NOT NULL DEFAULT 0,
                page     INTEGER NOT NULL DEFAULT -1,
                x0 REAL, y0 REAL, x1 REAL, y1 REAL,
                PRIMARY KEY (book_id, idx)
            ) WITHOUT ROWID
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) = Unit

    // ---------------------------------------------------------- books

    fun listBooks(): List<Book> {
        val books = mutableListOf<Book>()
        readableDatabase.rawQuery(
            "SELECT * FROM books ORDER BY COALESCE(last_opened_at, added_at) DESC",
            null,
        ).use { c ->
            while (c.moveToNext()) books.add(c.toBook())
        }
        return books
    }

    fun getBook(id: Long): Book? =
        readableDatabase.rawQuery("SELECT * FROM books WHERE id = ?", arrayOf("$id"))
            .use { if (it.moveToFirst()) it.toBook() else null }

    fun findByUri(uri: String): Book? =
        readableDatabase.rawQuery("SELECT * FROM books WHERE uri = ?", arrayOf(uri))
            .use { if (it.moveToFirst()) it.toBook() else null }

    /** Add a picked document, or return the row already there. */
    fun addBook(uri: String, title: String, kind: String): Book {
        findByUri(uri)?.let { return it }
        val values = ContentValues().apply {
            put("uri", uri)
            put("title", title)
            put("kind", kind)
            put("added_at", System.currentTimeMillis())
        }
        writableDatabase.insert("books", null, values)
        return findByUri(uri)!!
    }

    fun removeBook(id: Long) {
        writableDatabase.run {
            delete("tokens", "book_id = ?", arrayOf("$id"))
            delete("books", "id = ?", arrayOf("$id"))
        }
    }

    fun updateProgress(id: Long, index: Int) {
        writableDatabase.execSQL(
            "UPDATE books SET last_index = ?, last_opened_at = ? WHERE id = ?",
            arrayOf<Any>(index, System.currentTimeMillis(), id),
        )
    }

    fun resetProgress(id: Long) {
        writableDatabase.execSQL("UPDATE books SET last_index = 0 WHERE id = ?", arrayOf<Any>(id))
    }

    // --------------------------------------------------------- tokens

    fun saveTokens(bookId: Long, tokens: List<Token>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete("tokens", "book_id = ?", arrayOf("$bookId"))
            val insert = db.compileStatement(
                "INSERT INTO tokens (book_id, idx, text, para_end, page, x0, y0, x1, y1) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            tokens.forEachIndexed { i, token ->
                insert.clearBindings()
                insert.bindLong(1, bookId)
                insert.bindLong(2, i.toLong())
                insert.bindString(3, token.text)
                insert.bindLong(4, if (token.paraEnd) 1 else 0)
                insert.bindLong(5, token.page.toLong())
                val bbox = token.bbox
                if (bbox == null) {
                    for (slot in 6..9) insert.bindNull(slot)
                } else {
                    for (slot in 6..9) insert.bindDouble(slot, bbox[slot - 6].toDouble())
                }
                insert.executeInsert()
            }
            db.execSQL(
                "UPDATE books SET total_words = ? WHERE id = ?",
                arrayOf<Any>(tokens.size, bookId),
            )
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun loadTokens(bookId: Long): List<Token> {
        val tokens = mutableListOf<Token>()
        readableDatabase.rawQuery(
            "SELECT text, para_end, page, x0, y0, x1, y1 FROM tokens " +
                "WHERE book_id = ? ORDER BY idx",
            arrayOf("$bookId"),
        ).use { c ->
            while (c.moveToNext()) {
                val bbox = if (c.isNull(3)) null else floatArrayOf(
                    c.getFloat(3), c.getFloat(4), c.getFloat(5), c.getFloat(6),
                )
                tokens.add(Token(c.getString(0), c.getInt(1) != 0, c.getInt(2), bbox))
            }
        }
        return tokens
    }

    private fun android.database.Cursor.toBook() = Book(
        id = getLong(getColumnIndexOrThrow("id")),
        uri = getString(getColumnIndexOrThrow("uri")),
        title = getString(getColumnIndexOrThrow("title")),
        kind = getString(getColumnIndexOrThrow("kind")),
        totalWords = getInt(getColumnIndexOrThrow("total_words")),
        lastIndex = getInt(getColumnIndexOrThrow("last_index")),
        lastOpenedAt = getColumnIndexOrThrow("last_opened_at").let {
            if (isNull(it)) null else getLong(it)
        },
        addedAt = getLong(getColumnIndexOrThrow("added_at")),
    )
}
