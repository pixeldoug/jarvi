const ASSET_BASE = 'https://wonder-pepper-46952828.figma.site/_assets/v11';

const assets = {
  texture: `${ASSET_BASE}/52aab6b4fc7628bd017d3d635b1b41fef107609b.png`,
  heroDesktop: `${ASSET_BASE}/dd30de9f3a87f4e84f93fc8c5c8d57f2b5742f4f.svg`,
  heroMobile: `${ASSET_BASE}/03cdff5e14dd8a1db807f010d6905f6f5d6ecf85.svg`,
  betaIcon: `${ASSET_BASE}/73178df88a189e73cf39a607d9171739745cb922.svg`,
  featureLabelDesktop: `${ASSET_BASE}/f7759a934e22ea9ef862747c88af77da71864bda.svg`,
  featureLabelMobile: `${ASSET_BASE}/0ea80db3f640689d64553f7ca1759448a7cb13f9.svg`,
  brandDark: `${ASSET_BASE}/855f0e85bc49f91607945c718c67d29b4a7fbe61.svg`,
  brandLight: `${ASSET_BASE}/ce41ce0cb199f96ccaabafe226428dacd49e28eb.svg`,
  pauseIcon: `${ASSET_BASE}/26287ee2eaf7042cfcf7628c4b247a9e9fbdcc31.svg`,
  whatsappActive: `${ASSET_BASE}/bf895b2db7a1013eef467a058499356234415b55.svg`,
  envelopeIcon: `${ASSET_BASE}/595b902f6dd068d5114a0e7777f765a454268617.svg`,
  calendarIcon: `${ASSET_BASE}/a6df264fd68eedf83a98e7b6e97898c0d981af96.svg`,
  wandIcon: `${ASSET_BASE}/fc75fd314d41f9fd73c7d01956882714d827221e.svg`,
  cardsIcon: `${ASSET_BASE}/8474f05fe2ba0f323dc40f911f897921f310382d.svg`,
  checksIcon: `${ASSET_BASE}/56b87b0bd4f9b2bb029bdb2a026f32e7d58dc505.svg`,
  nextIcon: `${ASSET_BASE}/a1eca73b9bfbdd276e2d36e2a9f1689b86e5ebe3.svg`,
};

export default function HomePage() {
  return (
    <main className="homePage" style={{ '--texture': `url("${assets.texture}")` } as React.CSSProperties}>
      <header className="headerWrap">
        <div className="container">
          <div className="headerBar">
            <div className="brandGroup">
              <img src={assets.brandDark} alt="" aria-hidden="true" />
              <span>Jarvi</span>
            </div>
            <div className="headerActions">
              <a href="#acesso-antecipado" className="buttonGhost">
                Solicitar Acesso
              </a>
              <a href="https://app.jarvi.life/login" className="buttonPrimary">
                Login
              </a>
            </div>
          </div>
        </div>
      </header>

      <section className="container heroWrap">
        <div className="heroCard">
          <img className="heroBackgroundDesktop" src={assets.heroDesktop} alt="" aria-hidden="true" />
          <img className="heroBackgroundMobile" src={assets.heroMobile} alt="" aria-hidden="true" />

          <div className="heroContent">
            <div className="betaTag">
              <img src={assets.betaIcon} alt="" aria-hidden="true" />
              <span>versão beta</span>
            </div>

            <h1 className="heroTitle">
              <span className="heroTitleDesktop">
                Que tal uma mãozinha com as suas tarefas do dia a dia?
              </span>
              <span className="heroTitleMobile">Que tal uma mãozinha com suas tarefas?</span>
            </h1>

            <p className="heroDescription">
              Jarvi é um app inteligente que te ajuda a organizar tarefas complexas e também
              aquelas pequenas que são importantes
            </p>

            <div className="featureSection">
              <div className="featureRailWrap">
                <img
                  className="featureLabelDesktop"
                  src={assets.featureLabelDesktop}
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="featureLabelMobile"
                  src={assets.featureLabelMobile}
                  alt=""
                  aria-hidden="true"
                />

                <div className="featureRail">
                  <button type="button" className="featureChip featureChipActive" aria-label="WhatsApp">
                    <img src={assets.whatsappActive} alt="" aria-hidden="true" />
                  </button>
                  <button type="button" className="featureChip" aria-label="Email">
                    <img src={assets.envelopeIcon} alt="" aria-hidden="true" className="featureIcon featureIconMd" />
                  </button>
                  <button type="button" className="featureChip" aria-label="Calendário">
                    <img
                      src={assets.calendarIcon}
                      alt=""
                      aria-hidden="true"
                      className="featureIcon featureIconLg"
                    />
                  </button>
                  <button type="button" className="featureChip" aria-label="IA">
                    <img src={assets.wandIcon} alt="" aria-hidden="true" className="featureIcon featureIconLg" />
                  </button>
                  <button type="button" className="featureChip" aria-label="Visualizações">
                    <img src={assets.cardsIcon} alt="" aria-hidden="true" className="featureIcon featureIconSm" />
                  </button>
                  <button type="button" className="featureChip" aria-label="Tarefas">
                    <img src={assets.checksIcon} alt="" aria-hidden="true" className="featureIcon featureIconMd" />
                  </button>
                </div>

                <button type="button" className="featureMobileArrow" aria-label="Próxima funcionalidade">
                  <img src={assets.nextIcon} alt="" aria-hidden="true" />
                </button>
              </div>

              <div className="showcaseSurface">
                <div className="showcaseDesktopCard" />
                <div className="showcaseMobileCard" />
                <button type="button" className="pauseButton" aria-label="Pausar">
                  <img src={assets.pauseIcon} alt="" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="whatsAppCopy">
              <h2>Crie tarefas pelo Whatsapp</h2>
              <p>
                Envie textos, áudios ou documentos e a Jarvi entende o contexto e cria a tarefa
                para você.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container ctaWrap" id="acesso-antecipado">
        <div className="ctaCard">
          <h2>Garanta seu acesso antecipado</h2>
          <p>Seja um dos primeiros a testar a Jarvi e contribuir com feedbacks</p>
          <a href="#acesso-antecipado" className="ctaButton">
            Solicitar Acesso Antecipado
          </a>
        </div>
      </section>

      <footer className="container footerWrap">
        <div className="footerBar">
          <div className="brandGroup">
            <img src={assets.brandLight} alt="" aria-hidden="true" />
            <span>Jarvi</span>
          </div>

          <div className="footerMeta">
            <p>
              2026 - Uma empresa desenvolvida por{' '}
              <a href="https://strides.digital" target="_blank" rel="noreferrer">
                Strides Digital
              </a>
            </p>
            <a href="#">Termos de Serviço</a>
            <a href="#">Política de Privacidade</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
