# Lumio Component Tree

**Author:** lumio_architect (step 1)
**Produced:** 2026-04-24T03:09:22Z

Single-page tree, indexed so the UI builder and copywriter can reference components by ID.

```
<RootLayout>                                            id: root
 |--<Header>                                             id: header
 |   |--<BrandLogo />                                    id: logo
 |   |--<Nav />                                          id: nav (features, how, pricing, faq)
 |   '--<AuthActions />                                  id: auth-actions (Sign in, Start free)
 |
 |--<HeroSection>                                        id: hero
 |   |--<Pill>new feature tag</Pill>                     id: hero-pill
 |   |--<HeadlineDisplay />                              id: headline
 |   |--<SubheadCopy />                                  id: subhead
 |   |--<CallToActionRow>                                id: hero-cta
 |   |   |--<PrimaryCta>Start free</PrimaryCta>
 |   |   '--<SecondaryCta>See a 90 second tour</SecondaryCta>
 |   |--<HeroStatRow>                                    id: hero-stats
 |   |   |--<Metric value="84/mo" label="articles saved" />
 |   |   |--<Metric value="3.4x" label="recall lift" />
 |   |   '--<Metric value="5h/wk" label="time saved" />
 |   '--<HeroCardStack>                                  id: hero-card-stack
 |       |--<ReadingSessionCard />                       id: hero-session-card
 |       |--<RecallTodayCard />                          id: hero-recall-card
 |       '--<AtlasSuggestionCard />                      id: hero-atlas-card
 |
 |--<SocialProofStrip />                                 id: social-proof
 |
 |--<FeatureGrid>                                        id: features (2x2)
 |   |--<FeatureCard id="summary" />
 |   |--<FeatureCard id="atlas" />
 |   |--<FeatureCard id="recall" />
 |   '--<FeatureCard id="focus" />
 |
 |--<HowItWorks>                                         id: how (3 numbered steps)
 |
 |--<PricingGrid>                                        id: pricing
 |   |--<PricingCard tier="reader" />
 |   |--<PricingCard tier="deep" featured />
 |   '--<PricingCard tier="studio" />
 |
 |--<Testimonials>                                       id: testimonials
 |   |--<Quote author="Ines Ariyanti" />
 |   |--<Quote author="Dami Okonkwo" />
 |   '--<Quote author="Mikko Hakkarainen" />
 |
 |--<FaqAccordion>                                       id: faq (4 items)
 |
 |--<FinalCta />                                         id: final-cta
 '--<Footer />                                           id: footer

<SignupLayout>                                           id: signup-root
 |--<Header variant="minimal" />
 |--<SignupWizard>                                       id: signup-wizard
 |   |--<StepIndicator current="1" total="3" />
 |   |--<StepPane name="account" />                      id: signup-step-1
 |   |--<StepPane name="reading_profile" />              id: signup-step-2
 |   |--<StepPane name="plan_selection" />               id: signup-step-3
 |   '--<StepPane name="done" />                         id: signup-step-done
 '--<SignupAside>                                        id: signup-aside
     |--<WeekCard />
     |--<QuoteCard />
     '--<CalmByDesignCard />
```

## Data contracts between components

- `HeroCardStack` consumes `ReadingSession` objects from props, not fetches on its own.
- `PricingCard` consumes a `PricingTier` shape defined in `api_contract.yaml`.
- `SignupWizard` holds all form state locally, submits a synthetic payload per bake-mode scope.
- `FaqAccordion` uses native `<details>` for progressive enhancement plus zero-JS fallback.

## Handoff notes

- UI builder (step 3) implements these IDs as TSX components in `builds/lumio/frontend/components/`.
- Copywriter (step 5) targets IDs `hero-pill`, `headline`, `subhead`, `pricing-labels`, `faq-items`.
- Asset designer (step 6) provides `logo`, `hero-illustration`, `favicon`, referenced by `BrandLogo` and `HeroCardStack`.
