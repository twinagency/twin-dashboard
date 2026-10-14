/** Creator-approved unknown state. Missing/blank or confirmed facts preserve the normal reply path.
 * Bounded, English-language backstop for factual questions and unsupported first-person claims;
 * gender is never evidence for anatomy or medical history. No second model call.
 */
export const UNCONFIRMED_BODY_REPLY = "i don't have confirmed details about my anatomy or medical history to share, and i shouldn't guess. earlier messages aren't confirmation of those details.";
const TOPIC = /\b(?:anatomy|genitals?|genitalia|penis|vagina|vulva|pussy|cock|dick|testicles?|surgery|surgeries|operations?|procedures?|hormones?|hrt|estrogen|testosterone|transition(?:ed|ing)?|pre[- ]?op|post[- ]?op|fertility|fertile|infertile|periods?|menstruat\w*|pregnan\w*)\b/i;
const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'");
export function unconfirmedBodyReply(reply: string, fanText: string, facts?: string): string | null {
  if (facts?.trim().toLowerCase() !== 'unconfirmed') return null;
  const fan = normalize(fanText), text = normalize(reply);
  const factualQuestion = TOPIC.test(fan) && /\b(?:you|your|you're|youre|u|ur)\b/.test(fan)
    && /\?|\b(?:have|has|do|did|are|is|was|what|when|which|whether|tell|confirm|explain)\b/.test(fan);
  // Negated claims are claims too: "I haven't had surgery" is no more verified than "I have".
  const selfClaim = text.split(/[.!?\n]/).some(sentence => TOPIC.test(sentence)
    && /\bmy\b|\bi\s*(?:'m|'ve|'d|am|have|havent|haven't|had|hadnt|hadn't|did|didnt|didn't|do|dont|don't|was|wasnt|wasn't|got|take|took|started|went|transitioned|menstruate)\b/.test(sentence));
  const impliedAnatomy = /\binside\s+(?:me|myself)\b|\b(?:two|three|\d+)\s+fingers?\s+deep\b/.test(text);
  return factualQuestion || selfClaim || impliedAnatomy ? UNCONFIRMED_BODY_REPLY : null;
}
