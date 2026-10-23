import type { Metadata } from "next";
import Script from "next/script";
import RevealStage from "@/components/landing/RevealStage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "LOKMITRA | Every Government Benefit, In Your Own Language",
};

/**
 * LokMitra landing page (UI integrated from the Vaidyam frontend: scroll scrubbed video hero,
 * scramble type, cinematic paragraph, coverflow stats and the orbit reveal). Every CTA enters
 * the command deck at /dashboard. Copy rule: no dashes and no semicolons in visible text.
 */

export default function HomePage() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap"
        rel="stylesheet"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"
      />
      <link rel="stylesheet" href="/static/landing.css" />
      <link rel="stylesheet" href="/static/reveal/reveal.css" />


      <a className="skip-link" href="#hero-section">
        Skip to content
      </a>

      <div id="video-layer" aria-hidden="true">
        <video
          id="bg-video"
          loop
          muted
          playsInline
          preload="auto"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_39ca84eAE1ODL9hbR5VhoEj8tBf/hf_20260613_120544_a609e0c2-e52d-4bd5-b10f-b66ac51f1965.mp4"
        />
      </div>

      <div id="bottom-blur" aria-hidden="true" />

      <header id="main-header">
        <div className="desktop-header">
          <div className="header-left">
            <button
              type="button"
              className="logo-pill"
              id="logo-pill"
              data-scroll-top
              aria-label="LokMitra home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-img" src="/logo.png" width={26} height={26} alt="" aria-hidden="true" decoding="async" fetchPriority="high" draggable={false} />
              <span>LokMitra</span>
            </button>

            <nav className="menu-pill" id="menu-pill" aria-label="Primary">
              <button
                type="button"
                className="hamburger-btn"
                id="hamburger-btn"
                aria-label="Toggle menu"
                aria-expanded="false"
                aria-controls="menu-links"
              >
                <span className="hamburger-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <div className="menu-links" id="menu-links">
                <a href="#cinematic-section" data-nav-link>
                  How It Helps
                </a>
                <a href="#stats-section" data-nav-link>
                  Why Citizens Love It
                </a>
              </div>
            </nav>
          </div>

          <a
            className="download-btn"
            id="download-btn"
            href="/dashboard"
            data-enter-dashboard
            aria-label="Open the LokMitra dashboard"
          >
            <i className="bi bi-grid-1x2-fill" aria-hidden="true" />
            <span>Open Dashboard</span>
          </a>
        </div>

        <div className="mobile-header">
          <div className="mobile-left">
            <button
              type="button"
              className="logo-pill-m"
              id="logo-pill-m"
              data-scroll-top
              aria-label="LokMitra home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-img" src="/logo.png" width={22} height={22} alt="" aria-hidden="true" decoding="async" fetchPriority="high" draggable={false} />
              <span>LokMitra</span>
            </button>

            <nav className="menu-pill-m" id="menu-pill-m" aria-label="Primary mobile">
              <button
                type="button"
                className="hamburger-btn-m"
                id="hamburger-btn-m"
                aria-label="Toggle menu"
                aria-expanded="false"
                aria-controls="menu-links-m"
              >
                <span className="hamburger-icon-m" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <div className="menu-links-m" id="menu-links-m">
                <a href="#cinematic-section" data-nav-link>
                  How It Helps
                </a>
                <a href="#stats-section" data-nav-link>
                  Why Citizens Love It
                </a>
              </div>
            </nav>
          </div>

          <a
            className="download-btn-m"
            id="download-btn-m"
            href="/dashboard"
            data-enter-dashboard
            aria-label="Open the LokMitra dashboard"
          >
            <i className="bi bi-grid-1x2-fill" aria-hidden="true" />
            <span>Open Dashboard</span>
          </a>
        </div>
      </header>

      <main id="main-content">
        <div className="dot-grid" aria-hidden="true" />

        <section id="hero-section" aria-labelledby="hero-heading">
          <div className="hero-stack">
            <div className="hero-grid">
              <div className="hero-col-left">
                <h1 className="hero-title" id="hero-heading">
                  <span className="visually-hidden">LOKMITRA</span>
                  <span
                    className="scramble-line"
                    data-scramble-in
                    data-text="LOKMITRA"
                    data-delay="100"
                    aria-hidden="true"
                  />
                </h1>
              </div>
              <div className="hero-col-spacer" aria-hidden="true" />
            </div>

            <div className="hero-grid-bottom">
              <p className="hero-desc" id="hero-desc">
                One friendly assistant for every scheme India offers. Ask in your own language
                by voice or text and LokMitra finds what you deserve, checks your status on the
                official portal and tells you exactly what to do next, all in about two minutes.
              </p>
              <div className="hero-col-right">
                <p className="visually-hidden">Your Sahayak</p>
                <p className="hero-title right" aria-hidden="true">
                  <span
                    className="scramble-line"
                    data-scramble-in
                    data-text="Your"
                    data-delay="200"
                  />
                  <span
                    className="scramble-line"
                    data-scramble-in
                    data-text="Sahayak"
                    data-delay="400"
                  />
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="cinematic-section" aria-labelledby="cinematic-heading">
          <div id="cinematic-inner">
            <h2 id="cinematic-heading">
              Not another government website. A friend who knows them all. Tell LokMitra who
              you are and what you need, in the language you speak at home, and it finds the
              schemes you qualify for, checks your status on the official portal and explains
              the result in simple words. Farmers, workers, students, mothers, elders and small
              business owners finally get one trusted place to claim what is already theirs.
              No queues. No middlemen. No confusion.
            </h2>
          </div>
        </section>

        <section id="stats-section" aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="visually-hidden">
            Why citizens love LokMitra
          </h2>
          <div className="swiper" id="stats-swiper">
            <ul className="swiper-wrapper" id="swiper-wrapper" />
          </div>
        </section>
      </main>

      <section id="reveal-section" aria-labelledby="reveal-heading">
        <h2 id="reveal-heading" className="visually-hidden">
          Every benefit found, checked and explained by LokMitra
        </h2>
        <div id="reveal-root" data-mounted="true">
          <RevealStage />
        </div>
      </section>

      <footer id="main-footer">
        <p>LokMitra · The People&apos;s Bridge to Every Benefit</p>
        <p>
          <span id="footer-year" /> · Made with care for every citizen of Bharat
        </p>
      </footer>

      <Script
        src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"
        strategy="beforeInteractive"
      />
      <Script src="/static/landing.js" strategy="afterInteractive" />
    </>
  );
}
