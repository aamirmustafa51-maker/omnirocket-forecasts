"use client"
import { useState } from "react"

export default function ProspectLogo({
  website,
  brand,
  token,
  scrapedUrl,
  className
}: {
  website: string
  brand: string
  token: string
  scrapedUrl?: string
  className?: string
}) {
  const [primaryFailed, setPrimaryFailed] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  const domain = website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const logodevSrc = `https://img.logo.dev/${domain}?token=${token}&size=200&format=png`

  const primarySrc = scrapedUrl || logodevSrc
  const fallbackSrc = scrapedUrl ? logodevSrc : null

  if (primaryFailed && (fallbackFailed || !fallbackSrc)) {
    return <span className={`prospect-wordmark ${className ?? ""}`.trim()}>{brand}</span>
  }

  if (primaryFailed && fallbackSrc) {
    return (
      <img
        className={`prospect-logo ${className ?? ""}`.trim()}
        src={fallbackSrc}
        alt={brand}
        onError={() => setFallbackFailed(true)}
      />
    )
  }

  return (
    <img
      className={`prospect-logo ${className ?? ""}`.trim()}
      src={primarySrc}
      alt={brand}
      onError={() => setPrimaryFailed(true)}
    />
  )
}
