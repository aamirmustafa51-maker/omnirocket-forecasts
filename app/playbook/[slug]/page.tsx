import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import PlaybookTemplate from "@/magnets/brand-playbook/components/PlaybookTemplate"
import type { PlaybookData } from "@/magnets/brand-playbook/lib/types"
import TrackOpen from "./TrackOpen"

function loadPlaybook(slug: string): PlaybookData | null {
  const filePath = path.join(process.cwd(), "outputs", "playbook", `${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PlaybookData
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = loadPlaybook(params.slug)
  if (!data) return { title: "Not found" }
  return { title: `Brand Playbook — ${data.lead_company}` }
}

export default function Page({ params }: { params: { slug: string } }) {
  const data = loadPlaybook(params.slug)
  if (!data) notFound()
  return (
    <>
      <TrackOpen slug={params.slug} />
      <PlaybookTemplate data={data} />
    </>
  )
}
