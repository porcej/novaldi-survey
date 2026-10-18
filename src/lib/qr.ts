import { renderSVG } from 'uqr';

export function qrSvg(text: string): string {
  return renderSVG(text, {
    ecc: 'M',
    border: 2,
    pixelSize: 8,
    blackColor: '#00205b',
    whiteColor: '#ffffff',
  }).replace(/<\?xml[^>]*>/, '');
}
