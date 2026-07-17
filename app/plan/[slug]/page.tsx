import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import PlanTemplate from "@/magnets/game-plan/components/PlanTemplate"
import type { PlanData } from "@/magnets/game-plan/lib/types"
import TrackOpen from "./TrackOpen"

function loadPlan(slug: string): PlanData | null {
  const filePath = path.join(process.cwd(), "outputs", "plan", `${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PlanData
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = loadPlan(params.slug)
  if (!data) return { title: "Not found" }
  return { title: `90-Day Game Plan — ${data.lead_company}` }
}

export default function Page({ params }: { params: { slug: string } }) {
  const data = loadPlan(params.slug)
  if (!data) notFound()
  return (
    <>
      <TrackOpen slug={params.slug} />
      <PlanTemplate data={data} />
    </>
  )
}
