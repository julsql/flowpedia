import type { NotificationType } from "@flowpedia/shared";

/** Localized push copy. `{name}` = actor, `{title}` = article title. Falls back to
 *  English for any locale not listed. Mirrors the mobile in-app notification copy
 *  (kept here because the server can't reach the device's i18n). */
interface LocaleStrings {
  /** [title, "{name}…"] */
  follow_request: [string, string];
  follow_accepted: [string, string];
  follower: [string, string];
  /** [title, "{name}…{title}" (with article title), "{name}…" (no title)] */
  page_received: [string, string, string];
}

const COPY: Record<string, LocaleStrings> = {
  en: {
    follow_request: ["New follow request", "{name} requested to follow you"],
    follow_accepted: ["Request accepted", "{name} accepted your follow request"],
    follower: ["New follower", "{name} started following you"],
    page_received: ["A page for you", '{name} sent you "{title}"', "{name} sent you a page"],
  },
  fr: {
    follow_request: ["Nouvelle demande d'abonnement", "{name} souhaite vous suivre"],
    follow_accepted: ["Demande acceptée", "{name} a accepté votre demande d'abonnement"],
    follower: ["Nouvel abonné", "{name} vous suit désormais"],
    page_received: ["Une page pour vous", "{name} vous a envoyé « {title} »", "{name} vous a envoyé une page"],
  },
  es: {
    follow_request: ["Nueva solicitud de seguimiento", "{name} quiere seguirte"],
    follow_accepted: ["Solicitud aceptada", "{name} aceptó tu solicitud de seguimiento"],
    follower: ["Nuevo seguidor", "{name} empezó a seguirte"],
    page_received: ["Una página para ti", "{name} te envió «{title}»", "{name} te envió una página"],
  },
  de: {
    follow_request: ["Neue Follow-Anfrage", "{name} möchte dir folgen"],
    follow_accepted: ["Anfrage angenommen", "{name} hat deine Follow-Anfrage angenommen"],
    follower: ["Neuer Follower", "{name} folgt dir jetzt"],
    page_received: ["Eine Seite für dich", "{name} hat dir „{title}“ geschickt", "{name} hat dir eine Seite geschickt"],
  },
  it: {
    follow_request: ["Nuova richiesta di follow", "{name} vuole seguirti"],
    follow_accepted: ["Richiesta accettata", "{name} ha accettato la tua richiesta"],
    follower: ["Nuovo follower", "{name} ha iniziato a seguirti"],
    page_received: ["Una pagina per te", "{name} ti ha inviato «{title}»", "{name} ti ha inviato una pagina"],
  },
  pt: {
    follow_request: ["Novo pedido para seguir", "{name} quer seguir você"],
    follow_accepted: ["Pedido aceito", "{name} aceitou seu pedido para seguir"],
    follower: ["Novo seguidor", "{name} começou a seguir você"],
    page_received: ["Uma página para você", "{name} enviou «{title}» para você", "{name} enviou uma página para você"],
  },
  nl: {
    follow_request: ["Nieuw volgverzoek", "{name} wil je volgen"],
    follow_accepted: ["Verzoek geaccepteerd", "{name} heeft je volgverzoek geaccepteerd"],
    follower: ["Nieuwe volger", "{name} volgt je nu"],
    page_received: ["Een pagina voor jou", "{name} heeft je ‘{title}’ gestuurd", "{name} heeft je een pagina gestuurd"],
  },
  pl: {
    follow_request: ["Nowa prośba o obserwowanie", "{name} chce Cię obserwować"],
    follow_accepted: ["Prośba zaakceptowana", "{name} zaakceptował(a) Twoją prośbę"],
    follower: ["Nowy obserwujący", "{name} zaczął(-ęła) Cię obserwować"],
    page_received: ["Strona dla Ciebie", "{name} wysłał(a) Ci „{title}”", "{name} wysłał(a) Ci stronę"],
  },
  ru: {
    follow_request: ["Новая заявка на подписку", "{name} хочет на вас подписаться"],
    follow_accepted: ["Заявка принята", "{name} принял(а) вашу заявку"],
    follower: ["Новый подписчик", "{name} теперь подписан(а) на вас"],
    page_received: ["Страница для вас", "{name} отправил(а) вам «{title}»", "{name} отправил(а) вам страницу"],
  },
  tr: {
    follow_request: ["Yeni takip isteği", "{name} seni takip etmek istiyor"],
    follow_accepted: ["İstek kabul edildi", "{name} takip isteğini kabul etti"],
    follower: ["Yeni takipçi", "{name} seni takip etmeye başladı"],
    page_received: ["Sana bir sayfa", "{name} sana “{title}” gönderdi", "{name} sana bir sayfa gönderdi"],
  },
  el: {
    follow_request: ["Νέο αίτημα παρακολούθησης", "Ο/Η {name} θέλει να σε ακολουθεί"],
    follow_accepted: ["Το αίτημα έγινε δεκτό", "Ο/Η {name} αποδέχτηκε το αίτημά σου"],
    follower: ["Νέος ακόλουθος", "Ο/Η {name} σε ακολουθεί τώρα"],
    page_received: ["Μια σελίδα για σένα", "Ο/Η {name} σου έστειλε «{title}»", "Ο/Η {name} σου έστειλε μια σελίδα"],
  },
  ja: {
    follow_request: ["新しいフォローリクエスト", "{name}さんがあなたをフォローしたいです"],
    follow_accepted: ["リクエストが承認されました", "{name}さんがフォローリクエストを承認しました"],
    follower: ["新しいフォロワー", "{name}さんがあなたをフォローしました"],
    page_received: ["あなたへのページ", "{name}さんが「{title}」を送りました", "{name}さんがページを送りました"],
  },
  ko: {
    follow_request: ["새 팔로우 요청", "{name}님이 회원님을 팔로우하고 싶어합니다"],
    follow_accepted: ["요청 수락됨", "{name}님이 팔로우 요청을 수락했습니다"],
    follower: ["새 팔로워", "{name}님이 회원님을 팔로우하기 시작했습니다"],
    page_received: ["회원님을 위한 페이지", "{name}님이 ‘{title}’을(를) 보냈습니다", "{name}님이 페이지를 보냈습니다"],
  },
  zh: {
    follow_request: ["新的关注请求", "{name} 想关注你"],
    follow_accepted: ["请求已接受", "{name} 接受了你的关注请求"],
    follower: ["新粉丝", "{name} 开始关注你了"],
    page_received: ["给你的一篇页面", "{name} 给你发送了《{title}》", "{name} 给你发送了一篇页面"],
  },
};

export interface PushCopy {
  title: string;
  body: string;
}

/** Build localized push title/body for a notification. */
export function pushCopy(
  locale: string | null | undefined,
  type: NotificationType,
  name: string,
  articleTitle?: string | null,
): PushCopy {
  const lang = (locale ?? "en").split("-")[0];
  const strings = COPY[lang] ?? COPY.en;
  if (type === "page_received") {
    const [title, withTitle, plain] = strings.page_received;
    const body = (articleTitle ? withTitle.replace("{title}", articleTitle) : plain).replace(
      "{name}",
      name,
    );
    return { title, body };
  }
  const [title, bodyTpl] = strings[type];
  return { title, body: bodyTpl.replace("{name}", name) };
}
