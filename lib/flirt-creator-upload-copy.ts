import type { FlirtCreatorLocale } from "./flirt-creator-locale";

const uploadCopy: Record<string, string> = {
  "Paste a Google Drive or Dropbox folder link.": "Cole o link de uma pasta do Google Drive ou Dropbox.",
  "Saving link…": "Salvando link…",
  "Link not saved. Try again.": "O link não foi salvo. Tente novamente.",
  "Folder link saved. Awaiting import by your agency.": "Link salvo. Aguardando a importação pela sua agência.",
  "Use JPG, PNG, WebP or GIF photos, or MP4, MOV or WebM videos. Export HEIC photos as JPG first.": "Use fotos JPG, PNG, WebP ou GIF, ou vídeos MP4, MOV ou WebM. Exporte fotos HEIC como JPG antes do envio.",
  "This video is longer than 30 minutes.": "Este vídeo tem mais de 30 minutos.",
  "Export this video at 4K or lower.": "Exporte este vídeo em 4K ou em uma resolução menor.",
  "Your account storage is full. Your other files are saved. Contact support.": "O armazenamento da sua conta está cheio. Os outros arquivos continuam salvos. Fale com o suporte.",
  "This application is locked. Contact support.": "Este cadastro está bloqueado. Fale com o suporte.",
  "This file differs from the original. Remove it from this selection, then add it again.": "Este arquivo é diferente do original. Remova-o da seleção e adicione-o novamente.",
  "This file was removed. Remove it from this selection, then add it again.": "Este arquivo foi removido. Remova-o da seleção e adicione-o novamente.",
  "Sign in again, then reselect unfinished files. Saved content is safe.": "Entre novamente e selecione os arquivos pendentes. Seu conteúdo salvo continua disponível.",
  "Could not check whether this file is saved. Retry shortly.": "Não foi possível verificar se o arquivo foi salvo. Tente novamente em instantes.",
  "Reselect the original file to continue.": "Selecione o arquivo original novamente para continuar.",
  "This file is empty. Download the original to your phone and select it again.": "Este arquivo está vazio. Baixe o original no seu celular e selecione-o novamente.",
  "Connection interrupted. Retrying automatically…": "Conexão interrompida. Tentando novamente…",
  "Still saving. Checking again…": "O arquivo ainda está sendo salvo. Verificando novamente…",
  "Sign in again, then retry this file.": "Entre novamente e tente enviar este arquivo.",
  "This file could not be saved. Retry this file.": "Não foi possível salvar este arquivo. Tente novamente.",
  "Not yet confirmed saved. Retry this file; saved files will not upload again.": "O salvamento ainda não foi confirmado. Tente novamente. Os arquivos já salvos serão ignorados.",
  "Retry this file.": "Tente enviar este arquivo novamente.",
  "Checking previously selected files…": "Verificando os arquivos selecionados anteriormente…",
  "Reselect this file to check its saved status and continue.": "Selecione este arquivo novamente para verificar se foi salvo e continuar.",
};

export function creatorUploadCopy(message: string, locale: FlirtCreatorLocale, portugueseFallback: string): string {
  if (locale === "en") return message;
  return Object.hasOwn(uploadCopy, message) ? uploadCopy[message] : portugueseFallback;
}
