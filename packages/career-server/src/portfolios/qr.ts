import { toString as qrToString } from 'qrcode';

export function qrSvg(text: string): Promise<string> {
  return qrToString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 256 });
}
