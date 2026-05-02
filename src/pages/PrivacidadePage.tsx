export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <span className="text-white font-bold text-lg">L</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Política de Privacidade</h1>
          <p className="text-gray-500 mt-2">Live Equipamentos — LivePosVenda CRM</p>
          <p className="text-sm text-gray-400 mt-1">Última atualização: maio de 2026</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Sobre este documento</h2>
            <p>
              Esta Política de Privacidade descreve como a <strong>Live Equipamentos Ltda.</strong> ("nós", "nosso")
              coleta, usa e protege as informações obtidas por meio do aplicativo LivePosVenda CRM e suas integrações
              com plataformas de terceiros, incluindo Meta (Instagram e WhatsApp).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Dados coletados</h2>
            <p>Coletamos as seguintes informações para operação do CRM:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Nome, e-mail e telefone fornecidos voluntariamente por clientes e leads</li>
              <li>Identificador público do Instagram (PSID) de usuários que interagem via Direct Message</li>
              <li>Mensagens enviadas para nosso perfil no Instagram com finalidade de atendimento</li>
              <li>Dados de formulários de anúncios do Meta Ads preenchidos voluntariamente</li>
              <li>Informações de pedidos, garantias e ordens de serviço relacionadas a produtos Live Equipamentos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Finalidade do uso</h2>
            <p>Os dados são utilizados exclusivamente para:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Gestão de relacionamento com clientes (CRM)</li>
              <li>Atendimento e suporte pós-venda</li>
              <li>Acompanhamento de garantias e ordens de serviço</li>
              <li>Comunicação sobre produtos e serviços Live Equipamentos</li>
              <li>Melhoria contínua do atendimento</li>
            </ul>
            <p className="mt-3">
              Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros para fins comerciais.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Integrações com Meta (Instagram e WhatsApp)</h2>
            <p>
              O LivePosVenda CRM utiliza a API do Instagram e a API do WhatsApp Business, fornecidas pela Meta Platforms,
              para receber e gerenciar mensagens de atendimento. O uso dessas APIs está sujeito também às{" "}
              <a
                href="https://www.facebook.com/privacy/policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Políticas de Privacidade da Meta
              </a>
              .
            </p>
            <p className="mt-2">
              Dados obtidos via integrações Meta são armazenados em servidores seguros e utilizados apenas para
              fins de atendimento ao cliente conforme descrito nesta política.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Armazenamento e segurança</h2>
            <p>
              Os dados são armazenados na plataforma Supabase, com servidores localizados no Brasil (AWS São Paulo).
              Adotamos medidas técnicas e organizacionais para proteger as informações contra acesso não autorizado,
              incluindo criptografia em trânsito (HTTPS/TLS) e controle de acesso por perfil de usuário.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Retenção de dados</h2>
            <p>
              Os dados são mantidos pelo tempo necessário para prestação dos serviços e cumprimento de obrigações
              legais. Clientes podem solicitar a exclusão de seus dados a qualquer momento por meio dos canais
              de contato abaixo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Direitos do titular</h2>
            <p>Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), você tem direito a:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Acessar os dados que temos sobre você</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar a exclusão dos seus dados</li>
              <li>Revogar o consentimento para uso dos seus dados</li>
              <li>Obter informações sobre o compartilhamento dos seus dados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Contato</h2>
            <p>Para exercer seus direitos ou tirar dúvidas sobre esta política, entre em contato:</p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 space-y-1">
              <p><strong>Live Equipamentos Ltda.</strong></p>
              <p>E-mail: <a href="mailto:rodrigo@liveequipamentos.com.br" className="text-blue-600">rodrigo@liveequipamentos.com.br</a></p>
              <p>Site: <a href="https://liveequipamentos.com.br" target="_blank" rel="noopener noreferrer" className="text-blue-600">liveequipamentos.com.br</a></p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Alterações nesta política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. A data de "última atualização" no topo
              deste documento indica quando ocorreu a revisão mais recente. Recomendamos a consulta periódica.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} Live Equipamentos Ltda. — Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
}
