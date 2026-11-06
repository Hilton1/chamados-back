/** Link `wa.me` com mensagem pronta. Sem API oficial: quem envia é o condomínio/administradora. */
export function linkWhatsapp(telefoneE164: string, mensagem: string) {
  return `https://wa.me/${telefoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}
