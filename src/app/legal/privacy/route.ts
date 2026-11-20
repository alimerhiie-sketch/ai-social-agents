import { APP_NAME, OPERATOR, UPDATED, publicPage } from "@/lib/public-page";

export const dynamic = "force-static";

export function GET() {
  return publicPage(
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
<p class="meta">Last updated ${UPDATED}</p>
<p>This policy explains what ${APP_NAME} (operated by ${OPERATOR}) does with information when you connect a social media account.</p>
<h2>What we collect</h2>
<ul>
  <li><strong>From TikTok</strong>, after you authorise the connection: your basic profile information (open ID, display name, username and
  avatar), the posting options TikTok reports for your account (such as available privacy levels and whether comments, Duets and Stitches
  can be turned on), and the status and ID of each post we publish for you.</li>
  <li><strong>From Instagram</strong>: your account ID and username, and the ID and link of each post we publish for you.</li>
  <li><strong>Your content</strong>: the videos, images and captions you schedule.</li>
</ul>
<p>Access tokens are held by our connection provider, <a href="https://composio.dev/">Composio</a>, which connects to TikTok and Instagram
for us and refreshes the login. We do not see or store your TikTok or Instagram password.</p>
<h2>How we use it</h2>
<p>Only to show you which account is connected, to publish the posts you approve at the time you chose, and to show you whether each post
succeeded. We do not sell or share your information, use it for advertising, or build profiles of you or your viewers.</p>
<h2>Where it is stored</h2>
<p>On Cloudflare (database and file storage) in the Service's own account. Finished media files are deleted about 7 days after they are
posted.</p>
<h2>Keeping and deleting it</h2>
<p>We keep connection details until you disconnect. When you disconnect, or ask us to, we delete the stored profile information. You can
also remove the Service's access in TikTok (Settings and privacy → Security → Manage app permissions) or Instagram at any time.</p>
<h2>Children</h2>
<p>The Service is not meant for anyone under 18.</p>
<h2>Contact</h2>
<p>Questions or deletion requests: message <a href="https://www.instagram.com/amx_ai1/">@amx_ai1</a> on Instagram.</p>`,
  );
}
