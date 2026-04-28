import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import ForecastTemplate, { ForecastData } from "@/components/ForecastTemplate"

function loadForecast(slug: string): ForecastData | null {
  const filePath = path.join(process.cwd(), "forecasts", `${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as ForecastData
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = loadForecast(params.slug)
  if (!data) return { title: "Not found" }
  return { title: `Fatigue Forecast — ${data.brand}` }
}

export default function Page({ params }: { params: { slug: string } }) {
  const data = loadForecast(params.slug)
  if (!data) notFound()
  return <ForecastTemplate data={data} slug={params.slug} />
}
