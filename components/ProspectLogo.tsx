"use client"
import { useState } from "react"

export default function ProspectLogo({
  website,
  brand,
  token
}: {
  website: string
  brand: string
  token: string
}) {
  const [failed, setFailed] = useState(false)
  const domain = website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const src = `https://img.logo.dev/${domain}?token=${token}&size=200&format=png`

  if (failed) {
    return <span className="prospect-wordmark">{brand}</span>
  }

  return (
    <img
      className="prospect-logo"
      src={src}
      alt={brand}
      onError={() => setFailed(true)}
    />
  )
}
