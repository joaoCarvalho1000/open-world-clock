package io.joao.worldclock

import io.joao.worldclock.widget.worldShowsMeta
import io.joao.worldclock.widget.worldVisibleRows
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * How many rows fit, and whether each row can afford its second line, are the same question asked
 * twice. They disagreed: `worldVisibleRows` subtracted the seams between rows and `worldShowsMeta`
 * divided the whole height as though the rows were flush. Wrap limits and height are never
 * independent in this project, so the agreement is worth a test rather than a comment.
 */
class WorldWidgetFitTest {

    private companion object {
        /** 8dp of body padding, top and bottom. */
        const val BODY = 16

        /** The offset line needs a 46dp row. */
        const val META_ROW = 46
    }

    /** A 2dp seam sits between rows, so n rows carry n-1 of them. */
    private fun seams(rows: Int) = 2 * (rows - 1)

    @Test fun showingTheOffsetLineMeansTheTallerRowsActuallyFit() {
        var height = 100f
        while (height <= 400f) {
            val rows = worldVisibleRows(height)
            if (worldShowsMeta(height, rows)) {
                val needed = rows * META_ROW + seams(rows) + BODY
                assertTrue(
                    "at ${height}dp we show the offset line for $rows rows, which needs ${needed}dp",
                    needed <= height,
                )
            }
            height += 1f
        }
    }

    /**
     * The band the old formula got wrong: tall enough that four bare rows divide past 46dp, not
     * tall enough once the three seams between them are paid for.
     */
    @Test fun theSeamsAreNotFreeHeight() {
        val height = 202f
        assertEquals(4, worldVisibleRows(height))
        assertTrue("the old formula read this as roomy", (height - BODY) / 4 >= META_ROW)
        assertFalse("but three seams leave each row under 46dp", worldShowsMeta(height, 4))
    }

    @Test fun aGenuinelyTallWidgetStillShowsIt() {
        assertTrue(worldShowsMeta(260f, worldVisibleRows(260f)))
    }
}
