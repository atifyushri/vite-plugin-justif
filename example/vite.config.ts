import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
// This example lives inside the plugin's own repository, so it imports the
// built plugin straight from ../dist (run `bun run build` at the repo root
// first). In your app you would install the package and write:
//
//   import { vitePluginJustif } from "vite-plugin-justif";
//
import { vitePluginJustif } from "../dist/index.js";

export default defineConfig({
    plugins: [
        // The whole setup. `languages` doubles as bundle-size control:
        // only these three pattern files ship, each as its own lazy chunk.
        vitePluginJustif({ languages: ["en-us", "de", "fr"] }),
    ],
    resolve: {
        // In-repo counterpart of the package's `runtime/auto` subpath export;
        // unnecessary once the plugin is installed from npm.
        alias: {
            "vite-plugin-justif/runtime/auto": fileURLToPath(
                new URL("../dist/runtime/auto.js", import.meta.url),
            ),
        },
    },
});
