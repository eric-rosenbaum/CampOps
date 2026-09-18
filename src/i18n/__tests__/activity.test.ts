// Every sentence shape the web and the phone write into issue_activity, read back in Spanish and
// Hebrew. A shape that stops matching falls back to the stored English, which is survivable —
// but it is a regression this suite exists to notice.
import { describe, expect, it } from 'vitest';
import { activityStatusWord, translateActivity } from '../activity';

type Case = [stored: string, es: string, he: string];

const CASES: Case[] = [
  ['Logged by Eric Rosenbaum', 'Registrada por Eric Rosenbaum', 'נפתחה על ידי Eric Rosenbaum'],
  ['Issue logged by Eric', 'Registrada por Eric', 'נפתחה על ידי Eric'],
  ['Logged this', 'Registró esta orden', 'הקריאה נפתחה'],
  ['Edited by Ana', 'Editada por Ana', 'נערכה על ידי Ana'],
  ['Edited the details', 'Editó los detalles', 'הפרטים נערכו'],
  ['Assigned to María López by Eric', 'Asignada a María López por Eric', 'שויכה ל־María López על ידי Eric'],
  ['Assigned to Miguel', 'Asignada a Miguel', 'שויכה ל־Miguel'],
  ['Handed to Housekeeping by Eric', 'Pasada a Housekeeping por Eric', 'הועברה ל־Housekeeping על ידי Eric'],
  ['Sent to Grounds', 'Enviada a Grounds', 'הועברה ל־Grounds'],
  ['Unassigned by Prakash', 'Desasignada por Prakash', 'השיוך בוטל על ידי Prakash'],
  ['Unassigned', 'Quedó sin asignar', 'השיוך בוטל'],
  ['Dana unassigned themselves', 'Dana se quitó la asignación', 'Dana: השיוך העצמי בוטל'],
  ['Status changed to in progress by Eric', 'Estado cambiado a «En curso» por Eric', 'הסטטוס שונה ל„בטיפול” על ידי Eric'],
  ['Status changed to waiting on_vendor by Eric', 'Estado cambiado a «Esperando al proveedor» por Eric', 'הסטטוס שונה ל„ממתין לספק” על ידי Eric'],
  ['Changed status to Waiting on a part', 'Cambió el estado a «Esperando una pieza»', 'הסטטוס שונה ל„ממתין לחלק”'],
  ['Eric Rosenbaum set this to waiting on vendor', 'Eric Rosenbaum cambió el estado a «Esperando al proveedor»', 'Eric Rosenbaum: הסטטוס שונה ל„ממתין לספק”'],
  ['Marked resolved by Eric, actual cost $280', 'Marcada como hecha por Eric, costo real $280', 'סומנה כבוצעה על ידי Eric, עלות בפועל $280'],
  ['Marked resolved by Eric', 'Marcada como hecha por Eric', 'סומנה כבוצעה על ידי Eric'],
  ['Marked complete by Eric', 'Marcada como hecha por Eric', 'סומנה כבוצעה על ידי Eric'],
  ['Resolved, actual cost $1,250.00', 'Hecha, costo real $1,250.00', 'בוצעה, עלות בפועל $1,250.00'],
  ['Resolved', 'Hecha', 'בוצעה'],
  ['Ana marked this done', 'Ana la marcó como hecha', 'Ana: סומנה כבוצעה'],
  ['Ana undid closing this', 'Ana deshizo el cierre', 'Ana: הסגירה בוטלה'],
  ['Reopened by Ana', 'Reabierta por Ana', 'נפתחה מחדש על ידי Ana'],
  ['Reopened this', 'La reabrió', 'נפתחה מחדש'],
  ['Miguel took this on', 'Miguel la tomó', 'נלקחה על ידי Miguel'],
  ['Miguel took this issue', 'Miguel la tomó', 'נלקחה על ידי Miguel'],
  ['Miguel put this back', 'Miguel la devolvió a la cola', 'הוחזרה לתור על ידי Miguel'],
  ['Eric removed the vendor', 'Eric quitó al proveedor', 'הספק הוסר על ידי Eric'],
  ['Cleared the vendor', 'Quitó al proveedor', 'הספק הוסר'],
  ['Waiting on Hudson Valley Septic', 'Esperando a Hudson Valley Septic', 'ממתינה ל־Hudson Valley Septic'],
  ['Called in Ridgeline Electric', 'Llamó a Ridgeline Electric', 'הוזמן הספק Ridgeline Electric'],
  ['Eric recorded that Ridgeline did this', 'Eric registró que Ridgeline hizo el trabajo', 'Eric: העבודה בוצעה על ידי Ridgeline'],
  ['Eric Rosenbaum sent this to Hudson Valley Septic', 'Eric Rosenbaum se la envió a Hudson Valley Septic', 'הועברה לספק Hudson Valley Septic על ידי Eric Rosenbaum'],
  ['Flagged from Building Systems by Eric', 'Reportada desde Sistemas del edificio por Eric', 'דווחה ממערכות המבנה על ידי Eric'],
  ['Auto-created from recurring issue', 'Creada automáticamente a partir de un trabajo recurrente', 'נוצרה אוטומטית מעבודה חוזרת'],
  ['Added task', 'Agregó la tarea', 'המשימה נוספה'],
];

describe('translateActivity', () => {
  for (const [stored, es, he] of CASES) {
    it(`es: ${stored}`, () => expect(translateActivity(stored, 'es')).toBe(es));
    it(`he: ${stored}`, () => expect(translateActivity(stored, 'he')).toBe(he));
    it(`en: ${stored} is shown as stored`, () => expect(translateActivity(stored, 'en')).toBe(stored));
  }

  it('leaves a sentence nobody taught it as stored, in every language', () => {
    for (const lang of ['en', 'es', 'he'] as const) {
      expect(translateActivity('Something new happened', lang)).toBe('Something new happened');
      expect(translateActivity('', lang)).toBe('');
    }
  });

  it('leaves the sentence as stored when the status word is not one it knows', () => {
    // What a writer that used a LOCALIZED label would have stored.
    expect(translateActivity('Ana set this to en curso', 'es')).toBe('Ana set this to en curso');
    expect(translateActivity('Changed status to Open', 'he')).toBe('Changed status to Open');
  });

  it('gives writers English status words it can read back', () => {
    for (const s of ['unassigned', 'assigned', 'in_progress', 'waiting_on_vendor', 'waiting_on_part', 'resolved'] as const) {
      const sentence = `Ana set this to ${activityStatusWord(s)}`;
      expect(translateActivity(sentence, 'es')).not.toBe(sentence);
    }
  });
});
