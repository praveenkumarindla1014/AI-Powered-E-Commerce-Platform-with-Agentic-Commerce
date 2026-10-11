import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const SLIDES = [
  {
    kicker: 'Big Gadget Days',
    title: 'Smart tech, smarter prices',
    text: 'Earbuds, smartwatches and chargers with up to 15% off — and no-cost EMI on bigger buys.',
    cta: 'Shop electronics',
    to: '/?category=electronics',
    art: ['🎧', '⌚', '📱'],
    bg: 'linear-gradient(115deg, #1D4ED8 0%, #2874F0 45%, #06B6D4 100%)',
  },
  {
    kicker: 'Fashion Fiesta',
    title: 'Street style, fresh drops',
    text: 'Hoodies, sneakers and everyday essentials, picked for how you actually dress.',
    cta: 'Explore fashion',
    to: '/?category=fashion',
    art: ['👟', '👕', '👜'],
    bg: 'linear-gradient(115deg, #9F2089 0%, #E0287D 50%, #FF3F6C 100%)',
  },
  {
    kicker: 'Wellness Week',
    title: 'Feel good, every day',
    text: 'Yoga mats, foot comfort and health monitors for a healthier routine.',
    cta: 'Shop health',
    to: '/?category=health',
    art: ['🧘', '🍵', '🩺'],
    bg: 'linear-gradient(115deg, #047857 0%, #10B981 55%, #84CC16 100%)',
  },
  {
    kicker: 'Top Deals',
    title: 'Deals up to 25% off',
    text: 'Limited-time prices across the store. Your assistant can find the best ones in your budget.',
    cta: 'See all deals',
    to: '/?deals=1',
    art: ['🏷️', '💡', '🎁'],
    bg: 'linear-gradient(115deg, #EA580C 0%, #FB641B 45%, #FFB800 100%)',
  },
];

function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => setIndex(i => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(timer);
  }, [paused]);

  const go = delta => setIndex(i => (i + delta + SLIDES.length) % SLIDES.length);

  return (
    <section
      className="carousel"
      aria-roledescription="carousel"
      aria-label="Featured offers"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {SLIDES.map((slide, i) => (
          <div key={slide.kicker} className="slide" style={{ background: slide.bg }} aria-hidden={i !== index}>
            <div>
              <span className="slide-kicker">{slide.kicker}</span>
              <h2>{slide.title}</h2>
              <p>{slide.text}</p>
              <Link to={slide.to} className="btn" tabIndex={i === index ? 0 : -1}>{slide.cta} →</Link>
            </div>
            <div className="slide-art" aria-hidden="true">
              {slide.art.map(a => <span key={a}>{a}</span>)}
            </div>
          </div>
        ))}
      </div>
      <button className="carousel-arrow prev" onClick={() => go(-1)} aria-label="Previous slide">‹</button>
      <button className="carousel-arrow next" onClick={() => go(1)} aria-label="Next slide">›</button>
      <div className="carousel-dots">
        {SLIDES.map((slide, i) => (
          <button key={slide.kicker} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} aria-label={`Show ${slide.kicker}`} />
        ))}
      </div>
    </section>
  );
}

export default HeroCarousel;
