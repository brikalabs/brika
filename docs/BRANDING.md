# BRIKA

## Name

### Brand
**BRIKA** is the product and platform name.

The name is inspired by **brick** — a fundamental **building block**.

The idea behind BRIKA is simple:
- the system is built from **blocks**
- blocks are **independent**
- blocks can be **composed**, **replaced**, or **removed**
- the core remains stable

BRIKA is a **brand-first name**, not an acronym.

---

## Pronunciation

### English
- **BRIKA** → **BRI-kah** (`/ˈbrɪ.kə/`)

### French
- **BRIKA** → **BRI-ka**

### Japanese
- ブリカ (*bu-ri-ka*)

Two syllables, stress on the first:
**BRI**-ka

---

## Assistant persona (optional)

The assistant persona is intentionally **not the brand name**.

Recommended defaults:
- **Bri**
- **Rika**

Examples:
- "Hey **Bri**, turn on the lights."
- "**Rika**, what's the temperature?"

The persona name is configurable by the user.

---

## npm package naming

Scope:

```
@brika/*
```

Core packages:

```
@brika/hub
@brika/ui
@brika/sdk
@brika/shared
```

Plugins:

```
@brika/plugin-*
```

Examples:

```
@brika/plugin-mqtt
@brika/plugin-homekit
@brika/plugin-voice
```

---

## Domain naming

Primary domain:

```
brika.dev
```

Suggested subdomains:

```
docs.brika.dev
schema.brika.dev
store.brika.dev
api.brika.dev
```

---

## Schema URL convention

Canonical base:

```
https://schema.brika.dev/<version>/
```

Example:

```
https://schema.brika.dev/0.1.0/package.json
```

Rules:
- versions use **semver**
- schema URLs are **immutable**
- files are named after the entity they describe

---

## CLI name

Binary:

```
brika
```

Examples:
```bash
brika start
brika plugin install @brika/plugin-mqtt
brika plugin kill @brika/plugin-voice
```

---

## Text usage

- **Product name**: BRIKA
- **Code / packages**: `@brika/*`
- **Domains**: `brika.dev`, `schema.brika.dev`

BRIKA always refers to the platform, not the assistant persona.

