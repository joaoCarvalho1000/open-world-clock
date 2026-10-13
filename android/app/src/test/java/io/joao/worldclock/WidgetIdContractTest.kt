package io.joao.worldclock

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * In `RemoteViews` an id that no longer exists is not a crash. `setTextViewText` on a missing id
 * is silently dropped, so a renamed id in a layout becomes a blank line on someone's home screen
 * and nothing anywhere reports it. Thirteen widgets share two renderers, so this is the cheapest
 * guard against the one mistake that fails quietly.
 */
class WidgetIdContractTest {

    private fun moduleDir(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            if (File(dir, "src/main/res/layout").isDirectory) return dir
            dir = dir.parentFile
        }
        throw AssertionError("could not find the app module from ${File(".").absolutePath}")
    }

    @Test fun everyIdTheRenderersBindExistsInAWidgetLayout() {
        val module = moduleDir()
        val renderers = File(module, "src/main/java/io/joao/worldclock/widget")
            .listFiles { f -> f.extension == "kt" }
            .orEmpty()
        assertTrue("no renderer sources found", renderers.isNotEmpty())

        val referenced = renderers
            .flatMap { Regex("""R\.id\.(\w+)""").findAll(it.readText()).map { m -> m.groupValues[1] } }
            .toSet()
        assertTrue("expected the renderers to bind ids", referenced.size > 50)

        val layouts = File(module, "src/main/res/layout")
            .listFiles { f -> f.name.startsWith("widget_") && f.extension == "xml" }
            .orEmpty()
        val defined = layouts
            .flatMap { Regex("""@\+?id/(\w+)""").findAll(it.readText()).map { m -> m.groupValues[1] } }
            .toSet()

        val missing = (referenced - defined).sorted()
        assertTrue(
            "these ids are bound by a renderer but defined in no widget layout, so their binding " +
                "would be silently dropped at runtime: $missing",
            missing.isEmpty(),
        )
    }

    /** A layout that will not parse takes its widget down, and the picker preview with it. */
    @Test fun everyWidgetLayoutParses() {
        val layouts = File(moduleDir(), "src/main/res/layout")
            .listFiles { f -> f.name.startsWith("widget_") && f.extension == "xml" }
            .orEmpty()
        assertTrue("no widget layouts found", layouts.size >= 13)
        val broken = layouts.mapNotNull { file ->
            runCatching {
                javax.xml.parsers.DocumentBuilderFactory.newInstance()
                    .newDocumentBuilder().parse(file)
            }.exceptionOrNull()?.let { "${file.name}: ${it.message}" }
        }
        assertTrue("malformed widget layouts: $broken", broken.isEmpty())
    }
}
