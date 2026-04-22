import { Hero } from '@/components/hero';
import { FeatureGrid } from '@/components/feature_grid';
import { Pricing } from '@/components/pricing';
import { HowItWorks } from '@/components/how_it_works';
import { Faq } from '@/components/faq';
import { FinalCta } from '@/components/final_cta';
import { SocialProof } from '@/components/social_proof';
import { Testimonials } from '@/components/testimonials';

export const metadata = {
  title: 'Lumio, smart reading companion for busy minds',
  description:
    'Lumio turns everything you read into lasting understanding. Capture highlights, auto-summarize, spaced recall built in.',
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <SocialProof />
      <FeatureGrid />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <Faq />
      <FinalCta />
    </main>
  );
}
