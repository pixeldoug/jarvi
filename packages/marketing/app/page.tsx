const valuePoints = [
  {
    title: 'Clareza no que importa',
    description:
      'Tenha uma visão simples das tarefas que exigem foco para manter seu dia organizado sem sobrecarga.',
  },
  {
    title: 'Nada importante passa batido',
    description:
      'Acompanhe também as pendências pequenas que parecem simples, mas impactam sua rotina.',
  },
  {
    title: 'Ritmo consistente',
    description:
      'Transforme planejamento em ação com um fluxo prático para priorizar, executar e revisar tarefas.',
  },
];

const steps = [
  {
    title: 'Capture',
    description: 'Anote rapidamente tudo o que precisa ser feito.',
  },
  {
    title: 'Priorize',
    description: 'Organize tarefas por foco, urgência e contexto.',
  },
  {
    title: 'Execute',
    description: 'Siga o plano do dia com clareza e menos fricção.',
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <div className="badge">Jarvi</div>
          <h1>Que tal uma mãozinha com as tarefas do dia a dia?</h1>
          <p className="heroDescription">
            A Jarvi é um assistente inteligente que te ajuda a organizar tanto as tarefas em que
            você precisa focar quanto aquelas que parecem pequenas, mas são importantes.
          </p>
          <div className="heroActions">
            <a className="button buttonPrimary" href="https://app.jarvi.life/login">
              Começar agora
            </a>
            <a className="button buttonSecondary" href="#como-funciona">
              Ver como funciona
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Uma rotina mais leve e organizada</h2>
          <div className="grid">
            {valuePoints.map((item) => (
              <article key={item.title} className="card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section sectionAlt" id="como-funciona">
        <div className="container">
          <h2>Como funciona</h2>
          <div className="steps">
            {steps.map((step, index) => (
              <article key={step.title} className="step">
                <span>{`0${index + 1}`}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footerContent">
          <p>Jarvi</p>
          <a href="https://app.jarvi.life/login">Acessar aplicativo</a>
        </div>
      </footer>
    </main>
  );
}
