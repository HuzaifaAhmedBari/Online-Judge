---
name: Kinetic Logic
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c1c6d7'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8b90a0'
  outline-variant: '#414754'
  surface-tint: '#adc7ff'
  primary: '#adc7ff'
  on-primary: '#002e68'
  primary-container: '#4a8eff'
  on-primary-container: '#00285b'
  inverse-primary: '#005bc0'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb3ad'
  on-tertiary: '#68000a'
  tertiary-container: '#ff5451'
  on-tertiary-container: '#5c0008'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc7ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.6'
  data-label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 1.5rem
  gutter: 1rem
  density-high: 0.5rem
  density-tight: 0.25rem
---

## Brand & Style

The design system is engineered for high-performance competitive programming environments. It prioritizes information density and visual clarity over decorative elements, catering to developers who require rapid cognitive processing of complex data.

The style is a blend of **Modern Minimalism** and **Technical Utility**. It utilizes a deep, true-black environment to reduce eye strain during prolonged coding sessions. The aesthetic is "stealth-tech"—utilizing thin borders, monochromatic surfaces, and sharp accents to create a focused, low-distraction workspace. The emotional response is one of precision, speed, and objective technical authority.

## Colors

This design system uses a **Deep Dark** palette. Unlike traditional dark modes, it avoids blue-tinted grays in favor of neutral, achromatic blacks (`#000000`) and dark grays (`#121212`). This ensures that functional colors remain distinct and vibrant.

- **Primary (Electric Blue):** Reserved for the most important interactive calls to action, like "Submit" or "Run Tests."
- **Success (Emerald Green):** Used for "Accepted" statuses and passing test cases.
- **Error (Crimson Red):** Used for "Wrong Answer," "Runtime Error," or failed compilations.
- **Warning/Pending (Amber):** Used for items in the judge queue or "Time Limit Exceeded" warnings.
- **Surface Strategy:** Use `#121212` for primary containers and `#1E1E1E` for hover states or nested child elements.

## Typography

The typography system follows a dual-font strategy:
1. **Hanken Grotesk** is used for the UI framework, navigation, and general readability. It provides a sharp, contemporary feel that remains legible at small sizes.
2. **JetBrains Mono** is used for all technical content. This includes the code editor, test case inputs/outputs, memory/time constraints, and status labels. 

Information density is achieved by using a base body size of `14px` and a data size of `12px`. Tighten letter-spacing on headlines for a more "engineered" appearance.

## Layout & Spacing

The layout is a **High-Density Fluid Grid**. It is designed to maximize the visible code area while keeping problem descriptions and performance metrics accessible.

- **Desktop (1440px+):** Three-column layout. Left: Problem description/constraints; Middle: Code Editor; Right: Judge status/Test cases.
- **Gutter & Margins:** A strict 4px-base spacing scale. Use `16px` (4 units) for gutters and `24px` (6 units) for outer margins.
- **Density:** In data tables (leaderboards, submission history), use "Tight" density (`4px` vertical padding) to allow 20+ rows to be visible without scrolling.

## Elevation & Depth

This design system avoids heavy shadows and skeuomorphism. Depth is communicated through **Tonal Layering** and **Subtle Outlines**:

- **Level 0 (Background):** Pure `#000000`. Used for the overall application canvas.
- **Level 1 (Surface):** `#121212`. Primary cards and panels.
- **Level 2 (Active/Raised):** `#1E1E1E`. Used for hover states or active panel headers.
- **Outlines:** Use a `1px` solid border of `#2D2D2D` to separate UI sections. This replaces the need for shadows in a high-density environment, ensuring clear boundaries without visual "fuzziness."

## Shapes

The design system uses **Soft** geometry (`0.25rem` / `4px`). 

This subtle rounding prevents the UI from feeling aggressive (Brutalist) while maintaining the structural rigidity expected of a professional tool. Buttons and input fields use the standard `4px` radius. Tags and status "pills" (e.g., "Accepted") should use a higher `rounded-lg` (`8px`) to differentiate them from functional inputs.

## Components

- **Buttons:** 
  - *Primary:* Solid Electric Blue, white text. No gradient. 
  - *Secondary:* Ghost style, `#2D2D2D` border, white text.
- **Monospace Chips:** Used for problem tags (e.g., `dp`, `graphs`, `math`). Use `#1E1E1E` background with `JetBrains Mono` text.
- **Code Editor:** Integrated terminal-style appearance. No gutter background; line numbers in a muted gray. Highlight the active line with a subtle `#FFFFFF05` tint.
- **Status Indicators:** Large, bold monospace text for the result (e.g., **AC** in Emerald Green). Use small circular dots for test case visualizers (Green for pass, Red for fail).
- **Input Fields:** Flat `#121212` background with a 1px `#2D2D2D` border. On focus, the border changes to the Electric Blue accent.
- **Data Tables:** Zebra striping is discouraged. Use thin `#2D2D2D` horizontal dividers only.