import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import CallPrepTemplate, { CallPrepData } from "@/magnets/call-prep/components/CallPrepTemplate"

// Deliberately NO <TrackOpen />. Every other magnet page reports opens back to
// the tracker sheet; this one is read by Kyle, not the prospect, so counting it
// would corrupt the very engagement numbers this page is reporting.

function loadPack(slug: string): CallPrepData | null {
  const filePath = path.join(process.cwd(), "outputs", "call-prep", `${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CallPrepData
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = loadPack(params.slug)
  if (!data) return { title: "Not found" }
  return {
    title: `Call Prep — ${data.lead_company}`,
    // This page carries a prospect's private email thread with us. It must never
    // reach a search index.
    robots: { index: false, follow: false, nocache: true },
  }
}

export default function Page({ params }: { params: { slug: string } }) {
  const data = loadPack(params.slug)
  if (!data) notFound()
  return <CallPrepTemplate data={data} />
}
