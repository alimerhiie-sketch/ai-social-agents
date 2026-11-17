import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic (live D1 data), so no incremental cache is needed.
export default defineCloudflareConfig({});
