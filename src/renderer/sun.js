// Offline solar position and sunrise/sunset (NOAA/Astronomy Answers formulas).
// Derived from SunCalc, https://github.com/mourner/suncalc, used under the BSD 2-Clause License:
//
// Copyright (c) 2026, Volodymyr Agafonkin
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
//    1. Redistributions of source code must retain the above copyright notice, this list of
//       conditions and the following disclaimer.
//
//    2. Redistributions in binary form must reproduce the above copyright notice, this list
//       of conditions and the following disclaimer in the documentation and/or other materials
//       provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
// COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
// TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Pure functions, no DOM. Exposes window.WCSun.
(function () {
  const rad = Math.PI / 180;
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const J0 = 0.0009;
  const e = rad * 23.4397; // obliquity of the Earth
  const H0 = -0.833 * rad; // sunrise/sunset altitude (refraction + solar disc)

  const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (date) => toJulian(date) - J2000;

  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  function eclipticLongitude(M) {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = rad * 102.9372; // perihelion of the Earth
    return M + C + P + Math.PI;
  }
  const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L));
  const rightAscension = (L) => Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

  function altitude(date, lat, lng) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);
    const L = eclipticLongitude(solarMeanAnomaly(d));
    const dec = declination(L);
    const H = siderealTime(d, lw) - rightAscension(L);
    const h = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    return h / rad;
  }

  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  // Sunrise/sunset for the solar day nearest `date` at the given location.
  function times(date, lat, lng) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L);
    const Jnoon = solarTransitJ(ds, M, L);
    const cosW = (Math.sin(H0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1) return { sunrise: null, sunset: null, polar: 'day' };
    if (cosW > 1) return { sunrise: null, sunset: null, polar: 'night' };
    const w = Math.acos(cosW);
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return { sunrise: refine(fromJulian(Jrise), lat, lng), sunset: refine(fromJulian(Jset), lat, lng), polar: null };
  }

  // Newton steps so the event lands exactly where altitude() crosses -0.833 deg (keeps isDay consistent).
  function refine(date, lat, lng) {
    let t = date.getTime();
    for (let i = 0; i < 3; i++) {
      const a = altitude(new Date(t), lat, lng) + 0.833;
      const rate = (altitude(new Date(t + 60000), lat, lng) - altitude(new Date(t - 60000), lat, lng)) / 120000;
      if (!rate || Math.abs(a) < 1e-4) break;
      const step = a / rate;
      if (Math.abs(step) > 1800000) break; // grazing sun: keep the analytic estimate
      t -= step;
    }
    return new Date(t);
  }

  const isDay = (date, lat, lng) => altitude(date, lat, lng) > -0.833;

  const api = { times, altitude, isDay };
  if (typeof window !== 'undefined') window.WCSun = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
