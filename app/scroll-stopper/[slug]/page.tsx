import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import ScrollStopperTemplate, { ScrollStopperData } from "@/magnets/scroll-stopper/components/ScrollStopperTemplate"
import TrackOpen from "./TrackOpen"

function loadSheet(slug: string): ScrollStopperData | null {
  const filePath = path.join(process.cwd(), "outputs", "scroll-stopper", `${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as ScrollStopperData
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = loadSheet(params.slug)
  if (!data) return { title: "Not found" }
  return { title: `Scroll-Stopper Sheet — ${data.lead_company}` }
}

export default function Page({ params }: { params: { slug: string } }) {
  const data = loadSheet(params.slug)
  if (!data) notFound()
  return (
    <>
      <TrackOpen slug={params.slug} />
      <ScrollStopperTemplate data={data} />
    </>
  )
}
