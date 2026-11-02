import Link from "next/link";

import { Frame } from "@/components/Frame";
import { PRIMARY } from "@/components/ui";

export default function NotFound() {
  return (
    <Frame>
      <h1 className="title-1">Nothing here</h1>
      <p className="lede mt-3">That page doesn&apos;t exist, or what was on it has been removed.</p>
      <Link href="/" className={`${PRIMARY} mt-8`}>
        Go home
      </Link>
    </Frame>
  );
}
