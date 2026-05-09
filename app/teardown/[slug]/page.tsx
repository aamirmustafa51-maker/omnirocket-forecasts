import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import TeardownTemplate, { TeardownData } from "@/magnets/competitor-teardown/components/TeardownTemplate"
import TrackOpen from "./TrackOpen"

function loadTeardown(slug: string): TeardownData | null {
  const filePath = path.join(process.cwd(), "outputs", "teardown", `${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as TeardownData
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = loadTeardown(params.slug)
  if (!data) return { title: "Not found" }
  return { title: `Competitor Teardown — ${data.lead_company}` }
}

export default function Page({ params }: { params: { slug: string } }) {
  const data = loadTeardown(params.slug)
  if (!data) notFound()
  return (
    <>
      <TrackOpen slug={params.slug} />
      <TeardownTemplate data={data} />
    </>
  )
}
