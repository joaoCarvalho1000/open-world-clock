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
package io.joao.worldclock.core

import java.time.Instant
import kotlin.math.*

/** Solar altitude from the project's SunCalc-derived implementation. See THIRD_PARTY_NOTICES.md. */
object Sun {
    fun altitude(instant: Instant, latitude: Double, longitude: Double): Double {
        val rad = PI / 180
        val d = instant.toEpochMilli() / 86400000.0 - 0.5 + 2440588 - 2451545
        val m = rad * (357.5291 + 0.98560028 * d)
        val c = rad * (1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m))
        val l = m + c + rad * 102.9372 + PI
        val dec = asin(sin(rad * 23.4397) * sin(l))
        val ra = atan2(sin(l) * cos(rad * 23.4397), cos(l))
        val h = rad * (280.16 + 360.9856235 * d) + rad * longitude - ra
        val phi = latitude * rad
        return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(h)) / rad
    }
    fun isDay(instant: Instant, latitude: Double, longitude: Double): Boolean = altitude(instant, latitude, longitude) > -0.833
}
