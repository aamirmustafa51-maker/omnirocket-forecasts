export default function Home() {
  return (
    <div style={{
      maxWidth: 600,
      margin: "120px auto",
      padding: "0 24px",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      color: "#1a1a1a",
      lineHeight: 1.6
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 500, marginBottom: 16 }}>
        OmniRocket — Fatigue Forecasts
      </h1>
      <p style={{ color: "#5a5a5a" }}>
        This site renders personalized Meta ad fatigue forecasts for prospects.
        Forecasts live at <code>/forecast/[brand-slug]</code>.
      </p>
    </div>
  )
}
