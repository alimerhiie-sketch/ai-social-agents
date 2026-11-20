import { APP_NAME, OPERATOR, UPDATED, publicPage } from "@/lib/public-page";

export const dynamic = "force-static";

export function GET() {
  return publicPage(
    "Terms of Service",
    `<h1>Terms of Service</h1>
<p class="meta">Last updated ${UPDATED}</p>
<p>These terms cover your use of ${APP_NAME} (the "Service"), operated by ${OPERATOR}. By connecting an account or using the Service you
agree to them.</p>
<h2>1. What the Service is</h2>
<p>The Service is a private content calendar and publishing tool. It lets the account owner review posts (videos, images and captions) and
publish them, at a chosen time, to social media accounts the owner has connected, such as TikTok and Instagram.</p>
<h2>2. Who may use it</h2>
<p>The Service is for the account owner and people the owner authorises. You may only connect social media accounts that you own or are
allowed to manage, and you must follow the terms and community guidelines of each platform, including the
<a href="https://www.tiktok.com/legal/terms-of-service">TikTok Terms of Service</a> and
<a href="https://www.tiktok.com/community-guidelines">TikTok Community Guidelines</a>.</p>
<h2>3. Your content and your approval</h2>
<p>You own the content you publish through the Service and are responsible for it. Nothing is published without your approval: for every
post you see a preview and choose its settings (such as who can view it and whether comments, Duets or Stitches are allowed) before it is
scheduled. You can cancel a scheduled post at any time before it goes out.</p>
<h2>4. Connected accounts</h2>
<p>When you connect a TikTok or Instagram account, you allow the Service to use that platform's official API to publish the posts you
approve and to read the basic profile information needed to show which account is connected. You can disconnect at any time in the Service
or in the platform's own settings (for TikTok: Settings and privacy → Security → Manage app permissions).</p>
<h2>5. Availability</h2>
<p>The Service is provided as is. Platforms can reject, delay or change posts, and the Service may be unavailable at times. We are not
liable for lost reach, missed posting times or any indirect damages, to the extent the law allows.</p>
<h2>6. Changes</h2>
<p>We may update these terms; the date above shows the latest version. Continued use after a change means you accept it.</p>
<h2>7. Contact</h2>
<p>Questions: message <a href="https://www.instagram.com/amx_ai1/">@amx_ai1</a> on Instagram.</p>`,
  );
}
