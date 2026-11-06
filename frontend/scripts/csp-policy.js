// Compatibility name for the no-address policy; the header builder owns the directives.
import {buildSecurityHeaders} from './security-headers.js';
export const proposedCsp=buildSecurityHeaders()['Content-Security-Policy'];
