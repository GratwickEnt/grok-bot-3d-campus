import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  // The repo root is a separate demo app with its own lockfile. Keep this
  // build rooted here so Next does not treat the demo as the workspace.
  turbopack: { root },
};
