import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Legal = () => {
  const { type } = useParams();
  const { t } = useTranslation();

  const renderContent = () => {
    switch (type) {
      case 'mentions-legales':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.mentions.section1_title')}</h3>
              <p dangerouslySetInnerHTML={{ __html: t('legal.mentions.section1_content') }}></p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.mentions.section2_title')}</h3>
              <p dangerouslySetInnerHTML={{ __html: t('legal.mentions.section2_content') }}></p>
            </section>
          </div>
        );

      case 'cgv':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.cgv.section1_title')}</h3>
              <p>{t('legal.cgv.section1_content')}</p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.cgv.section2_title')}</h3>
              <p>{t('legal.cgv.section2_content')}</p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.cgv.section3_title')}</h3>
              <p>{t('legal.cgv.section3_content')}</p>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.cgv.section4_title')}</h3>
              <p>{t('legal.cgv.section4_content')}</p>
            </section>
          </div>
        );

      case 'confidentialite':
        return (
          <div className="space-y-6">
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.privacy.section1_title')}</h3>
              <p>{t('legal.privacy.section1_intro')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-1 opacity-80">
                  <li>{t('legal.privacy.section1_li1')}</li>
                  <li>{t('legal.privacy.section1_li2')}</li>
                  <li>{t('legal.privacy.section1_li3')}</li>
              </ul>
            </section>
            <section>
              <h3 className="text-xl text-rose-gold mb-2">{t('legal.privacy.section2_title')}</h3>
              <p>{t('legal.privacy.section2_content')}</p>
            </section>
            <section>
                <h3 className="text-xl text-rose-gold mb-2">{t('legal.privacy.section3_title')}</h3>
                <p>{t('legal.privacy.section3_content')}</p>
            </section>
          </div>
        );

      default:
        return (
            <div className="text-center py-10">
                <p className="text-xl text-rose-gold">{t('legal.not_found')}</p>
                <Link to="/" className="text-sm opacity-60 mt-2 hover:underline">{t('legal.back_home')}</Link>
            </div>
        );
    }
  };

  const getTitle = () => {
    switch(type) {
      case 'mentions-legales': return t('home.footer_legal');
      case 'cgv': return t('home.footer_cgv_full');
      case 'confidentialite': return t('home.footer_privacy_full');
      default: return t('legal.info');
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 font-serif text-cream flex justify-center pt-24 relative z-10 animate-fade-in">
      <div className="max-w-3xl w-full">
        <Link to="/" className="inline-flex items-center gap-2 text-rose-gold hover:text-rose-pale mb-8 transition-colors group">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> {t('legal.back_home')}
        </Link>
        
        <div className="bg-ruby-dark/80 backdrop-blur-xl border border-rose-gold/20 p-8 md:p-10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <h1 className="text-3xl md:text-4xl font-script text-rose-pale mb-8 border-b border-rose-gold/30 pb-4">
            {getTitle()}
          </h1>
          <div className="text-sm md:text-base leading-relaxed text-cream/80 font-light">
            {renderContent()}
          </div>
        </div>
        
        <footer className="mt-8 text-center text-xs text-rose-gold/40">
            {t('legal.footer_copyright', { year: new Date().getFullYear() })}
        </footer>
      </div>
    </div>
  );
};

export default Legal;