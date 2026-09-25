/* ---------- src/renderer/views/world-land.js ---------- */
try {
// World land outline (Natural Earth 110m via world-atlas, public domain), equirectangular, lat 75N..58S, lng -180..180.
// Generated offline; x = (lng + 180) * 10, y = (75 - lat) * 10.
window.WCWorldLand = { width: 3600, height: 1330, north: 75, south: -58, d: 'M1122 1288l13 7 14 2-4 5-10 0-5-3-3 4-8 3-11-1-8-3-10-1-13-6-10-5-14-12 9 2 14 7 13 4 5-5 3-7 10-4 7 1 3 5zm93-27l8 4-3 4-14 3-4-4-9 5-5-5 12-5 8 2zm1288-14l-16 1 0-6 2-4 0-2 7 3 9 2 1 2zm751-89l10 3 5-1 8-2 6 1 1 12-4 3-1 8-3-3-7 7-2 0-7-1-6-8-1-7-6-8 0-5zm276 1l2 4 8-4 2 4 0 5-3 4-7 8-5 4 4 5-8 0-8 3-3 7-6 10-8 5-5 2-9 0-6-3-11-1-2-3 5-8 13-10 6-2 8-3 8-6 6-5 5-7 4-3 1-5 7-5zm16-47l7 10 1-7 4 3 2 8 8 3 6 1 6-4 5 1-2 9-3 6-8-1-3 3 1 5-1 2-4 5-5 7-8 4-1-3-4-1 5-8-3-6-11-4 1-4 7-3 1-8 0-6-4-7 0-2-5-4-7-9-5-7 4 0 6 5 7 3zm-75-140l-4 2-5-3-7-4-7-6-6-7-2-3 5 0 5 4 5 3 3 3 8 6zm113-49l3 3-1 6-7 1-5-1-1-5 4-3 4 1zm16-7l-6 2-7 2-1-4 5-2 3 0 6-3 0 5zm-3600-5l2-1-1 5-1 1 0-5zm3478 4l-3 1-3-4 0-3zm-7-16l2 8-3-1-2 1-1-3-1-8zm-1170-13l1 12 3 4-1 5-2 3-3-6-2 3 2 8-1 4-3 2-1 9-4 11-5 14-6 19-4 14-4 11-8 3-9 4-6-3-8-3-2-5-1-9-4-8 0-7 1-8 5-1 0-4 5-7 1-7-3-4-2-7 0-9 3-5 1-7 5 0 6-2 4-2 4 0 6-6 8-6 3-5-1-4 4 1 5-7 1-6 3-5 3 5 3 4zm935 2l3 7 7-3 3 4 5 4-1 4 2 9 1 5 3 1 3 9-1 5 3 7 11 5 7 5 6 4-1 2 6 7 4 10 4-2 4 5 2-2 2 11 7 6 5 4 8 8 2 8 1 5-1 7 5 8-1 9-2 5-2 9 0 5-2 7-5 10-7 4-4 8-3 5-3 9-4 5-2 7-2 7 1 3-6 4-11 0-9 4-5 4-6 4-8-4-6-2 1-5-5 2-9 7-9-3-5-1-6-1-10-3-6-6-2-8-2-5-5-4-10-1 3-5-2-7-5 7-9 2 6-6 1-6 4-5-1-7-8 9-6 3-4 8-8-4 0-6-6-7-5-4 2-2-13-6-7 0-10-5-18 1-13 3-11 4-10-1-10 5-9 3-2 5-3 4-9 0-6 1-9-2-7 1-7 1-6 5-3 0-5 2-5 4-7-1-7 0-10-6-6-2 0-6 5-1 2-2 0-4 1-7-1-6-5-10-2-6 0-5-4-7 0-3-4-4-2-8-5-8-2-4 5 4-4-9 5 3 3 4 0-5-5-8-1-3-2-3 1-6 2-2 1-5-1-6 4-7 1 7 4-7 9-3 4-4 8-4 5-1 2 1 8-3 6-1 2-3 3 0 5 0 11-3 5-5 3-5 5-5 1-4 0-5 7-9 4 9 5-2-4-5 3-5 5 2 1-7 5-5 3-4 5-2 0-3 4 1 0-2 5-1 5-2 7 5 6 6 6 0 6 1-2-6 5-8 4-2-1-3 4-6 6-3 5 1 9-2 0-5-8-3 6-2 6 3 6 4 8 2 3-1 6 3 6-2 4 0 2-1 5 5-3 5-4 4-3 0 1 4-3 5-4 5 1 3 8 6 8 3 5 3 7 6 3 0 5 3 2 3 9 3 7-3 2-6 2-4 1-6 3-8-1-4 0-3-1-6 2-8 1-2-1-3 2-5 2-6 0-3 4-3 3 5 1 6 2 1 1 4 3 5 1 6zm185-33l3 3-7 0-4-6 6 2zm-414-3l-4 1-13-7 9-2 5 3 4 3zm402-3l-4 0-6-1-3-2 1-4 7 2 3 2zm8-3l-2 2-7-9-2-6 3 0 4 8zm-373 5l-8 3-1-2 1-3 4-6 10-4 1-2 8-3 7 0 4-1 3 1-3 3-11 4-8 3zm-65-20l4 3 6-1 2 4-11 2-7 1-6 0 4-5 5-1zm50 0l-1 6-15 2-14-1 0-4 8-2 6 3 7 0zm370 2l0 2-8-4-5-3-4-4 2-1 4 3 8 4zm-24-10l-2 1-4-2-4-4 0-2 6 4zm-489-5l19 1 3-4 18 4 4 7 15 2 12 6-11 4-11-5-9 1-11-1-9-2-12-4-7-1-4 2-18-4-2-5-9 0 7-10 12 1 8 3 4 1zm261-6l-5 7-1-8 2-3 2-4 2 3zm212 6l-3 1-4-4-5-6-2-8 2-1 1 3 3 3 4 6 5 3zm-39-13l-5 1-2 2-5 3-6 2-5 0-8-3-6-3 1-3 9 2 5-1 2-5 1 0 1 5 6 0 3-4 5-3-1-6 6-1 2 2 0 6zm-248-20l-3 3-7-2-2-4 10-1zm33-4l3 8-8-5-8 0-6 0-7 0 2-6 13 0zm226 14l-3 3-2-6-2-4-4-3-6-5-7-3 2-2 6 3 3 2 4 2 4 5 4 3zm-190-33l3 16 11 6 8-11 11-6 9 0 9 4 7 3 11 2 17 7 19 6 7 5 5 5 2 6 16 6 3 5-9 1 2 7 9 6 6 11 6 0 0 4 7 2-3 2 11 4-1 3-7 1-2-3-9-1-10-2-8-6-5-6-6-8-13-5-8 3-6 3 1 8-8 3-5-1-11-1-9-8-10-2-2 3-13 0 4-8 7-3-3-11-5-8-19-9-8 0-15-10-3 5-4 1-2-4 0-4-8-5 11-3 7 0-1-3-15 0-4-6-9-2-4-5 14-2 5-3 16 4zm-89-26l-8 10-7 2-10-2-16 0-9 2-2 7 9 9 6-4 18-4 0 5-5-2-4 6-9 4 10 13-2 3 9 12 0 6-6 3-4-3 5-8-10 4-2-3 1-4-7-6 1-10-7 3 1 12 0 14-6 2-4-3 3-9-2-10-4 0-3-7 4-7 1-7 5-16 2-4 9-7 8 3 12 1 12 0 10-7zm35 3l-1 8-5-1-1 7 4 5-3 1-4-6-3-13 2-8 3-4 1 6 6 1zm-229 70l-11 0-8-9-13-8-4-6-8-8-5-7-8-14-8-9-3-8-4-8-9-7-5-8-8-6-10-11-1-5 6 1 16 2 9 9 7 7 6 4 9 11 11 0 8 7 6 8 7 5-4 8 6 4 4 0 1 7 4 5 7 1 5 7-2 12zm121-77l11 9-12 1-3 7 0 9-9 7-1 10-4 15-1-3-11 4-4-6-7-1-5-3-12 4-4-5-7 0-8-1-1-13-5-3-5-8-1-9 1-9 6-7 7 3 8-2 2-8 4-2 12-2 7-8 5-6 4-4 9-5 7-7 5-8 4 0 5 5 1 4 6 3 9 3-1 4-7 0 2 5-7 4-6 9 7 9zm85-66l1 6 0 6-3 9-4-10-4 5 3 8-3 4-12-6-3-7 3-5-6-4-3 4-5-1-7 6-2-3 4-8 6-3 6-4 3 5 8-3 2-5 7 0-1-8 8 5 1 5zm-452 22l-9 2-4-8-2-14 4-16 7 5 5 7 5 11-2 10zm-1421-39l-9 1-2-1 3-3 0-4 6-1 2 0zm1849-2l-4 4-3 6-3 3-6-7 2-3 2-3 1-6 6 0-2 6 8-9zm-55 10l-13 9 5-7 7-6 6-7 5-10 2 8-7 6zm34-26l6 3 6 0 0 4-5 5-6 3 0-5 0-5zm36-3l3 12-8-3 0 3 3 6-5 3 0-7-3-1-2-6 6 1 0-4-6-8 9 1zm-40-9l-2 9-5-5-5-8 9 1zm-2-54l6 3 3-3 1 3-1 4 3 7-2 8-6 4-2 8 2 8 6 1 4-1 13 5-1 6 3 2-1 5-8-5-4-6-2 4-7-6-9 2-5-3 1-4 3-2-3-3-1 4-5-6-2-4 0-10 4 4 1-16 3-9zm-1869 3l-2 2-8 0-6 1 0-5 1-1 8 0 5 1zm-113 3l-3 2-6-2-5-3 1-3 4 0 2 0 7 1 5 2 2 3zm43-20l9 2 1-2 8 0 6 3 2 0 2 3 6 0-1 3 5 0 5 4-4 4-5-2-4 0-4 0-1 2-4 0-2-2-3 1-4 7-3-2 0-2-7-2-4 1-7-1-4 2-6-3 1-4 10 2 7 1 4-3-5-4 0-4-6-1 2-3zm1829 12l-8 5-8-3-1-9 5-4 11-3 6 0 2 4-4 4zm-2658-4l-2 2-2-2 0-2-2-4 1-1 1-2 0-2 0-1 1 1 4 1 2 1 1 1 3 4-4 3zm-6-15l-3 0-2-2-1-1 1-1 3 1 3 1zm-7-6l0 1-5 0 0-1zm-9-1l-1 0-3 0-2-2 0-1 3-1 1 0zm-16-7l-2 1-3-2 1 0 1-1 2 0zm796-8l4 4 10-1 3 2 9 6 6 5 3 0 6 2-1 3 8 0 7 4-1 2-7 2-6 0-7-1-15 1 7-5-4-3-6 0-4-3-2-6-6 0-9-2-3-2-13-2-4-2 4-2-10-1-7 5-4 0-2 3-4 1-5-1 6-3 2-4 4-2 5-2 8-1 2-1 9 1 8 0zm22-10l-3 1-2-6-4-3 2-6 3 0 4 9zm1987 10l-5 8-5-8-1-8 6-9 8-8 5 3-2 6zm-1990-38l-11 2-1-4 5-1 7 1zm8 0l-2 7-2-1 1-5-5-4 0-1zm2116-75l2 3-6 6-4-3-5 2-3 6-6-3 0-5 5-6 6 2 4-5zm-1000-16l-7 5 1 1 0 1-10 4-5-1-2-4 4 0 1 0 1-3 8 0zm-109 0l5 3 8 0 8 0-1 2 6-1-1 3-15 1 0-2-12-2zm-82-25l-3 8 1 3-2 5-8-4-5-1-14-5 2-5 11 1 11-1zm-63-30l6 7-1 13-5 0-4 3-4-3 0-12-2-6 5 1zm1318 41l-4 8 2 5-5 7-13 4-18 1-14 11-7-3 0-8-18 2-11 5-12 0 10 8-7 16-6 5-5-4 2-9-6-3-4-7 10-3 5-6 10-6 7-6 20-3 11 2 10-18 7 5 15-10 5-4 7-12-2-12 4-6 11-2 5 14 0 8-9 10zm-1314-51l-4 8-4-2-3-7 2-3 7-4zm1343-20l7 2 7-4 2 11-14 3-9 10-16-7-5 11-11 0-2-10 5-7 11-1 3-14 3-8 11 11zm-2076-23l8 1 9 0-5 4-4 0-12-4-3-3 4-3zm19-26l-5 0-13-3-9-5 3-1 13 3 11 4zm-617 6l-5 1-17-4-3-4-8-3-2-3-11-2-3-5 0-3 11 2 6 2 9 1 4 4 5 4 10 4zm674-22l-7 9 7-3 6 2-3 3 9 3 4-3 10 4-3 7 7-2 1 5 4 7-5 8-4 1-7-2 2-8-2-2-12 9-6 0 7-5-10-2-10 0-20 0-1-3 6-4-4-2 8-6 10-16 7-6 8-3 5 0-2 3zm-766-33l10-1-4 11 9 8-4 0-6-4-4-5-5-3-1-5 0-3zm2763 33l11 17-15-3-6 14 9 11 0 7-8-6-6 7-2-8 1-10-1-11 2-7 1-14-6-9 1-14 9-5-4-4 5-2 2 7 4 10-1 9zm-1504-16l-18 6-14-1 8-11-5-10 14-8 7-4 9-1 10 6-5 7 2 7zm195-33l-6 8-11-6-1-4 15-3zm-1657-15l-10 4-5-3-2-5 9-3 6-2 6 1 5 3zm1500-15l-11 10 10-1 11 0-2 8-9 9 10 1 10 13 7 1 6 12 3 4 12 2-1 6-6 3 4 5-9 5-13 0-17 3-5-2-6 5-9-1-7 3-6-2 15-10 9-2-16-2-3-4 11-3-6-5 2-7 15 1 2-6-7-6-12-2-3-3 4-4-3-3-6 5 0-10-6-5 4-10 8-8 8 0zm-1626-13l-6 1-6-1-7-3 10-2 8 1zm863-23l-4 6-4-1-3-3 1-1 4-3 4 0zm-26-5l-12 5-7 0-2-3 8-4 13 0zm-898-11l6 2 6-1 8 3 10 1-1 1-7 2-8-2-4-2-9 1-2-1zm865-19l2 5 5-2 6 3 11 3 12 3 0 5 8-1 7 4-9 3-15-3-6-4-10 5-14 5-4-5-13 1 8-5 2-8 3-9zm707-8l-2 7 11 7-13 7-15 4-14 3-9 2-13-1-28-4 10-4-22-5 18-2 0-3-21-2 6-7 16-1 15 7 15-6 13 3 16-5zm-614-6l-11 0-2-5 4-5 9-2 8 3 0 4-1 2zm1250 258l5 7 5 1 3 2-8 1-2 8-2 4-3 2 0 5 3 7 9 2 7 5 15 2 15-3 1-2-2-7 2-11-8-3 3-7-7 0 2-9 10 3 8-4-7-6-3-5-8 2-1 8-3-7-1-2 3-4-2-4-12-3-4-9-6-3 0-3 10 1 0-7 9-2 8 1 2-9-2-7-10 1-8-2-12 4-9 2-5 6-9 2-10 10 9 9-1 7 11 12zm-2291-277l12 4 13 4 13 5 13 5-1 6 7 3-3-8 27 2 10 5 10 4-10 5-16 1-1 9-4 2-9 0-8-3-13-3-2-5-10-1-12 1-5-3 2-4-12 2 5 5-6 4 0-40zm2926-60l-24 5-8 3 12 2 15 2 9-2 5 7 5-3 16-2 32 2 2 5 21 0 21 1 1-7 21 1 16 0 16 6 5 6-6 4 12 8 16 4 5-5 5-5 16 4 17-3 19 4 7-3 17 1-8-9 14-4 23 1 23 1 22 2 22 2 9 6 13 4 13 4 20-1 20-1 20 1 8 4-1 8 12 3 14-2 18-1 18 2 19-1 9 5 9 4 12-3-8-7 5-4 31 3 21-1 29 5 14 4 0 40-13 5-13-1 9 5 6 8 5 3 1 4-3 3-18-2-15 3-13 4-9 1-16 8-14 6-4 4-14-7-13 4-13 4-5-4-9 5-14-2-3 7-12 10 1 4 11 2-1 14-10 1-4 8 4 4-17 6-4 11-15 2-3 11-14 9-4-7-4-15-6-22 5-14 9-6 0-4 16-3 8-6 9-6 18-10 18-8 8-15-12 1-6 9-13 5-13 6-8-13-26 4-13 8-12 8 8 7-22 2-15 1 0-7-15-2-13 5-30-1-17 1-16 2-17 9-15 10-10 6-10 6-10 6-9 6 16 1 5 6 10 2 6-5 11 1 14 11 1 9-8 10-1 12-4 16-15 14-4 7-13 12-14 11-6 6-14 6-6 0-6-5-14 7-1 4-4-1-4 4-3 3 0 7-5 2-2 2-4 3-6 2-5 2 0 5-1 1 4 1 6 5 8 12 3 6 0 12-4 5-9 2-8 4-9 1-1-5 2-8-5-10 8-2-7-8-5-2-1 1-3 1-1-2-2 0-3-2 3-4 2-2-1-1 3-6-1-2-6-1-4-2-14 3-8 4-10 3 5-5-2-4 8-6-6-5-8 3-12 7-6 6-10 1-5 5 6 6 8 2 0 5 8 2 11-7 9 4 7 0 1 6-14 2-5 6-9 5-5 7 10 5 4 10 6 9 7 8 0 8-6 2 2 6 6 3-2 8-2 8-6 1-7 10-8 14-9 12-14 9-14 8-11 1-6 5-4-3-6 4-14 5-10 2-4 11-5 0-3-7 3-4-14-3-5 1-13 9-8 9-2 7 7 11 10 13 9 6 6 8 4 19-1 17-8 7-12 6-8 9-12 9-4-6 3-7-8-6-8-1-4-6-5-10-9-4-9 0 2-8-9 0-1 11-5 15-3 8 0 8 7 0 4 9 2 9 5 5 6 2 5 5 3 1 6 6 4 6 0 7-1 5 1 3 1 6 4 3 3 9 0 3-7 1-9-8-12-8-1-5-6-6-1-9-4-5 1-7-2-5-4-3-2-5-5-6-5-5-2 6-2-5 2-7 3-9-1-8 3-7-4-6 1-11-4-5-3-12-2-13-4-8-7 5-11 7-6-1-6-2 3-13-2-9-8-12 2-3-6-2-7-8-3-5-1-5-2-5-4-6-9 0 1 4-3 6-5-2-1 1-3-1-4-1-1 4-7 0-12 2 0 8-5 5-14 7-12 12-7 6-10 7 0 4-5 3-9 3-5 1-3 8 2 13 1 8-4 9 0 17-6 1-4 8 3 3-9 3-4 6-4 3-9-9-5-14-4-10-3-5-5-9-3-13-2-6-9-14-4-19-3-13 0-12-2-10-14 6-7-1-13-12 4-4-3-3-11-9-8-2-3-8-7-7-19 2-16 0-14 1-19-3-11-2-11-1-4-13-5-1-8 1-10 5-12-3-10-8-10-3-6-9-8-13-5 1-7-3-3 4-6-1 2 5-1 2 3 7 4 9 5 2 2 4 7 4 0 4-1 4 1 3 3 3 2 3 1 2-1-7 3-5 3-1 3 3 0 6-2 6 2 4 2-1 0 3 8-2 8 0 6 1 7-7 7-6 7-7 3-3 1 1-1 4-1 2 1 8 4 7 6 3 7 2 6 1 5 6 2 3 4 2 0 2-4 6-1 3-4 3-4 7-5-1-2 3-1 5 1 6-1 2-5 0-6 3-1 5-2 2-6 0-4 3 0 4-5 3-6-1-6 3-5 0-7 3-2 5 0 3-10 4-16 5-9 7-5 1-3-1-5 4-7 2-8 1-3 0-2 3-3 0-1 3-5 0-3 1-7 0-3-6 1-6-2-3-2-7-3-4 2-1-1-4 1-2 0-4-1-5-4-3 0-4-5-3-6-9-3-8-7-7-4-1-7-10-1-7 1-6-6-11-5-4-5-2-3-6 0-2-3-5-3-2-3-8-7-8-5-7-5 0 2-5 0-4 2-4-1-1-3 4-2 8-2 5-3 2-3-4-5-4-7-15-1 1 4 11 6 10 8 16 4 5 3 6 9 11-2 1 0 7 12 9 2 2 3 10-2 2 1 10 4 12 4 2 5 4 6 12 3 9 5 5 14 9 5 6 6 6 3 3 5 3 2 3 0 4-6 3 4 2 4 2 2 4 4 5 5 0 10-3 10-1 9-3 5-1 4-2 5 0 4 0 4-2 6-1 4-3 4 0 0 3-1 5 0 6-2 3-2 11-5 11-6 13-9 15-9 11-11 13-10 9-15 9-10 8-11 12-2 5-2 3-7 4-3 4-3 1-2 7-3 4-2 6-4 4-5 12 1 6 6 3 1 3-3 6 1 3-1 5 3 6 5 10 3 2 2 5-1 10 2 8 0 16 2 5-3 7-4 7-6 6-10 4-11 5-11 11-4 1-7 8-4 2-1 7 5 8 2 5 0 3 2 0-1 10-1 4 2 2-1 4-5 4-8 3-12 6-4 3 1 4 2 1-1 5-2 8-1 8-3 5-7 5-2 1-4 5-3 5-5 7-12 11-7 6-7 4-11 4-5 1-1 2-6-1-5 2-11-2-6 1-4 0-11 4-8 1-6 4-5 0-4-3-3-1-5-4 0 1-2-2 1-6-4-7 3-2 0-7-6-10-5-8-8-13-7-8-4-7-2-10-3-7-3-15 0-12-1-6-4-4-5-8-6-12-2-7-8-9-1-8-1-6 2-9 3-9 1-5 3-9 2-4 6-6 3-5 1-7 0-6-3-3-3-6-2-6 0-2 3-4-3-10-2-7-5-6 1-2-1-3-3-8-8-10-10-10-7-9-6-10 0-3 2-3 3-8 2-7-2-2 3-11 2-8-4-6-5-2-2-5-2-1 0-3-10 4-4-1-4 3-8-1-5-6-4-7-7-7-7 0-9 0-8 2-8 2-16 6-6 3-9 3-9-3-4 0-7-2-6 0-12 2-7 3-10 4-2-1-3 0-10-4-9-8-9-5-6-7-3-1-7-4-5-5-2-4-1-7-5-6-4-4-2-1-3-2-1-5-1-2-3-1-6-5-4 0-2-3 0-2-3-2-1-2-1-8 1-4-4-8-5-3 4-2 5-7 2-5-1-6 3-5 2-9-2-10-1-5 1-5-2-5-6-4 1-4 0-5 4-3 3-5 0-3 3-7 6-7 3-1 3-6 0-5 4-7 6-3 7-10 5-4 9-1 8-7 5-3 8-8-2-13 4-8 1-6 6-6 10-5 8-4 7-10 3-7 7 0 6 5 10-1 10 2 4 0 10-5 11-2 6-4 10-3 17-2 16-1 5 2 10-4 10 0 4 2 7 0 11-5 7 2 0 5 8-4 1 2-5 5 0 5 3 2-1 9-6 5 1 5 6 0 2 5 4 2 12 3 4-1 8 2 13 4 5 9 9 2 14 4 11 5 5-2 5-5-3-8 3-4 8-5 6-1 14 2 3 4 4 0 3 2 10 1 3 3 13 0 10 3 9 3 5 1 8-3 4-3 9-1 7 2 3 5 2-4 8 3 8 0 5-2 3-3-1-1 3-5 2-7 1-3 4-8 5-7-1-8 2-4-3-5 4-4-6 1-9-2-7 6-15 1-8-5-11-1-2 4-7 2-10-6-11 0-6-10-7-5 5-8-6-5 11-9 15-1 4-7 19 1 12-6 12-3 17 0 17 7 14 4 12-2 9 1 12-5 1-5-2-6-6-4-6-1-3-3-13-9-12-4-8-5 7-2 8-8-5-4 14-4 0-3-9 2-8 1-6 3-10 1-8 3 0 6 5 3 10-1-2 4-11 2-13 5-6-2 2-4-10-3 1-2 10-4-3-2-16-2 0-4-10 1-3 6-8 7 0 3-5 2-3-1-2 12-6 4-3 7 3 6 1 4 9 3-2 2-12 1-4 3-8 5-4-4 1-2-7-1-5 0-12 2 7 6-5 1-6 0-5-5-2 2 3 6 5 5-4 2 5 5 5 3 0 5-9-2 3 5-6 1 4 9-7 0-8-4-4-8-2-7-4-5-5-5 0-3-2-1 0-2-6-4-1-4 1-7 1-3-1-2-2-1-3-3-5-2-9-3-6-4-9-3-8-7 2-1-5-4 0-4-6-1-3 4-3-3 0-4 2-1-8-1-8 3 1 5-1 3 3 5 9 5 5 8 11 8 8 0 3 3-3 2 9 3 7 3 9 5 1 2-2 4-6-5-8-1-4 6 7 4-1 5-5 1-5 8-4 1 0-3 2-6 2-2-4-5-3-5-4-2-3-4-6-2-5-4-7-1-8-4-9-7-7-5-3-10-5-1-8-4-5 2-6 4-4 1-9 6-19-3-15 3-1 6 0 6-9 7-13 2-1 3-6 6-4 8 4 6-6 4-2 7-7 2-7 7-13 0-10 0-6 4-4 4-5-1-3-4-3-5-10-2-4 3-5-2-5 1 2-8-1-6-5-1-2-3 1-7 4-4 0-4 2-6 0-4-2-3 0-4 0-7-4-4 14-7 12 1 14 0 11 2 8-1 16 1 5-6 2-20-10-11-8-5-15-4-1-7 13-2 17 3-3-12 9 5 23-8 3-8 9-2 8-2 5-3 9-15 14-4 8 0 2-2 8 0 2 2 7-5-2-4-1-6-4-5 0-10 2-3 2-3 9-1 4-2 8-3-1 5-2 3 1 3 5 1-2 4-3-1-8 7 3 5 0 4 10 2 0 4 11-2 5-3 11 4 5 3 7-3 16-4 12-4 10 2 1 3 10 0 2-5 14-3-2-8 0-8 5-6 9-4 8 8 8 0 2-8 1-6-3 1-7-3-1-6 13-3 13-1 10 2 11-1 11-5-10-5-18 1-18 3-16 3-6-6-10-3 2-10-4-9 4-6 9-6 12-6 11-5 7-2-1-4-14-5-17 3-10 7 2 6-16 8-20 9-7 14 7 7 10 5-9 11-11 3-4 17-5 9-12-1-6 8-12 0-3-9-8-11-8-15-6-6-10 6-10 6-13 2-14-5-4-11-3-23 9-6 13-4 14-5 9-5 10-5 9-7 10-7 11-10 13-9 16-8 14-6 14-6 22-5 16 1 15-8 19 0 18-2 16 4 15 3-13 3 11 6 10-3 17 6 27 2 20 6 18 6 8 4 0 7-11 5-16 3-22-4-23-4-7 2 16 7 1 15 13 3 8 2 1-4-6-5 7-3 24 6 8-3-6-7 11-5 12-5 9 1 10 3 5-7-8-6 5-6-7-6 28 4 5 5-12 1 0 6 7 3 16-2 2-6 21-5 17-4 18-5 8 1-10 6 12 1 7-3 19-1 15-4 11 6 12-6-11-6 6-4 29 4 14 3 18 5 18 6 7-5-10-5-1-3-12-1 4-4-6-8 0-3 9-5 9-4 7-9 7-2 27 2 2 6-10 8 7 3 3 7-2 14 11 6-5 7-10 7-9 7 11 1 4-3 11-3 3-5 9-5-6-5 4-7-11-1-2-5 8-10-13-8 18-7-2-7 5-1 5 6-4 10 11 1-5-7 17-4 21 0 18 6-9-9-1-10 18-3 24 1 21-1-8-6 10-5 256 0zm-2082 59l-7 3-13-3-8 1-14-4 9-3 7-4 10 2 6 2 3 2zm2756-21l0 4-11 0-2-3 13-4 0 3zm-3600-3l0 3 0-3zm0 0l1-1 9 0 14 3-1 2-10 2-13 1zm895 20l0 10 13-8 12 7-3 7 10 7 10-7 7-9 1-11 14 1 15 1 13 5 1 5-8 6 7 5-1 5-19 7-14 1-11-3-3 5-9 9-3 4-12 7-14 1-8 4-1 6-11 2-13 8-10 11-4 8-1 12 15 1 4 10 5 7 14-2 19 4 10 4 7 5 12 3 11 4 16 1 11 1-1 8 3 10 7 11 15 10 8-3 5-11-5-15-7-6 16-4 11-7 6-7-1-7-7-9-12-7 12-11-5-9-3-15 7-3 17 3 10 1 9-2 9 3 12 6 3 4 18 0 0 9 3 12 9 2 7 6 15-6 10-11 6-4 8 9 13 12 11 12-4 7 13 5 9 6 16 3 7 3 4 8 7 2 4 3 1 12-7 3-7 4-17 3-12 9-17 1-22-2-15 0-10 1-8 7-13 4-15 14-11 9 8-2 16-13 21-8 15-1 9 5-9 6 3 11 3 8 13 5 17-2 10-11 0 7 7 4-12 6-23 6-9 4-12 8-7-1-1-9 18-8-16 0-11 2 1 3-10 5-11 3-10 3-6 7-1 1 0 6 3 5 4 0-1-3 3 2-1 3-6 1-5 0-8 2-4 0-6 1-8 3 15-2 3 2-14 3-7 0 0-2-3 3 3 1-2 7-7 8-1-3-2 0-3-3 2 5 2 2 0 4-3 4-5 8-1-1 3-6-5-4-2-8-1 4 2 6-7-1 7 3 0 9 3 1 1 3 2 10-7 8-10 3-7 6-5 0-5 4-1 3-11 7-6 5-4 6-2 7 2 7 3 8 5 7 0 5 4 11 0 7 0 4-3 6-3 1-5-1-1-4-4-3-5-8-5-8-2-4 2-7-2-5-8-8-4-2-10 5-2-1-5-5-6-2-11 1-9-1-8 1-4 1 2 3 0 4 2 2-2 1-4-1-4 2-7 0-7-6-9 1-7-2-6 1-9 2-9 8-10 4-5 5-3 4 0 7 1 5 2 3-4 9-2 7-1 14-1 5 2 5 3 5 2 8 7 7 2 6 4 5 11 2 4 5 9-3 7-1 8-2 6-2 6-4 3-6 0-8 2-3 7-3 11-2 8 0 6 0 3 2 0 5-6 5-2 7 2 1-2 5-2 7-3-2-2 0 0 1 2 1 0 2-2 5 1 1-1 4 1 1-2 5-2 2-1 1-2 3 3 2 1-2 3 2 1 0 2-2 3 0 1 1 1 0 5 0 5 0 3-1 1-1 3 0 3 1 2 0 2-1 5 1 1 1 3 2 3 2 4 1 3 3-1 1-1 2 1 4-2 3-1 4-1 5 1 2 0 5-1 1-1 4 0 3-2 2 1 3 1 2 3 5 4 4 5 4 3 4 0 2 4 0 1 0 3 2 5-1 4-2 6-2 3-3 6 0-1 1 6 1 4 2 4 3 3 2 6 1 7-7 4-1 0-4 2-8 6-5 6 0 1-2 8 1 8-5 4-3 4-4 4 0 3 3-2 3-1 3-5 1 3 4 0 6-5 5 4 8 4 0 3-8-4-3 0-8 12-4-1-4 4-4 3 7 7 1 7 5 0 3 9 1 11-1 5 4 8 1 6-3 0-2 12-1 12 0-8 3 3 5 8 0 8 5 1 8 5 0 4 2 7 4 6 7 0 5 4 0 6 5 4 3 12 2 1-2 8 0 10 2 4 2 7 2 11 8 1 4 4 0 2 6 6 17 5 2 1 7-8 8 3 3 18 1 0 10 8-6 12 3 17 7 5 5-2 6 12-3 19 5 15 0 15 8 13 11 7 3 9 0 4 4 3 12 2 6-4 17-5 6-14 14-7 12-7 8-3 1-3 7 1 19-3 15-1 7-3 4-2 13-10 13-1 10-9 5-2 6-11 0-15 4-8 4-11 3-11 8-9 10-1 7 1 6-2 10-2 5-7 5-11 18-9 8-7 4-4 10-7 6-4 6-11 6-8-2-5 1-9-5-7 1-6-6-1 5 13 9-2 7 7 4-1 5-9 13-15 5-20 2-11-1 2 6-2 8 2 5-6 3-11 2-9-4-4 3 1 10 7 3 5-4 3 6-9 3-8 6-1 10-3 5-9 0-8 6-3 7 10 7 10 2-4 9-12 6-6 12-9 4-4 4 3 11 6 6-4-1-9 0-4 2-9 4-2 9-4 1-12-4-11-7-12-5-4-7 3-6-5-6-1-17 4-10 11-8-15-3 9-8 3-17 12 4 5-21-7-3-3 13-6-2 3-14 3-19 5-6-3-10-1-11 4-1 6-16 7-16 5-15-3-15 3-8-1-12 6-13 2-19 3-21 3-22-1-16-2-15-10-5-1-4-19-10-18-11-8-7-4-8 1-3-8-13-10-18-9-20-4-5-4-7-7-7-8-4 4-4-5-10 3-7 8-6 5-7-2-5-4 5-6-5 2-2-1-9 3-2 2-6 4-7-1-4 6-2 6-4-1-3 4-1-1-5 3-3 5-1 4-6 4-5-4-3 2-6-2-9 2-2-2-9-4-5-3-3-2-6 2-2-2-1-2-3-5-3-5 1-2 3-4 3-2 0-1 2 5 6-3 1-1 1-5 1-2-6-1 2-3-1-2-4-4-1-3-1-4 0 0 2-2-1-5-2-2-3 1-1 0-3-3-2-4-2-3-1-1-3-3-2 1 3-2 2-2-2-4-1-1-2 0-3 1-4-2-1 2-2-4-3-4-4-2-3-5-4-5-4 1-2 2 2 1-1-2-3-3-1-1 3-6-1-3-1-5-2-5 0-3-2-5-2-6 0-5-2-5-4-12-11-5-3-8-3-6 1-8 3-5 1-7-2-7-2-9-5-8-1-11-5-9-4-2-3-6-1-10-3-4-4-11-6-5-6-2-5 3-1-1-3 2-3 0-3-3-5-1-4-3-5-9-10-10-7-5-7-9-4-1-2 1-6-5-3-6-5-2-7-6 0-6-6-4-5-1-3-5-7-4-8 1-4-8-4-3 1-6-3-1 4 1 5 1 7 4 4 7 7 2 3 1 0 2 4 1 0 2 6 3 3 3 3 6 5 3 10 3 4 3 5 0 5 5 0 4 5 4 4 0 2-5 4-1 0-3-6-7-6-7-5-5-2 0-8-1-5-5-3-7-5-1 2-2-3-7-2-6-6 1-1 4 1 4-4 0-5-7-7-6-3-4-6-4-6-4-8-4-9-2-5-6-6-5-1-1-3-6-1-3-2-10-1-2-2-1-6-10-10-8-14 0-2-5-3-7-9-2-8-5-5 2-8 0-9-3-8 4-9 2-18-2-14-3-8-3-5 1-2 15 4 5 9 3-3-2-8-3-8-2 0-19-10-7-4-18-4-6-9 2-6-13-5-2-8-12-7 0-5-6-4-9-3-2-9-13-8-6-9-9-1-16 0-12-3-10-5-11-5-9-2-18-4-14 1-19-5-12-4-11 2 2 7-6 1-11 2-9 3-11 2-2-5 5-10 11-3-3-3-13 6-7 6-14 7 7 5-9 8-11 4-10 3-3 4-15 5-3 5-12 4-7 0-9 2-10 4-9 3-17 3-1-2 11-4 9-3 11-6 12-1 5-4 14-6 2-2 8-4 1-7 6-6-12 3-3-2-6 4-6-5-3 3-4-5-10 4-6 0-1-6 2-3-6-4-13 2-9-5-6-2-1-6-7-4 4-6 8-5 3-5 8-1 7 1 8-4 8 0 7-3-2-4-5-2 7-4-6 0-11 2-3 3-7-3-15 2-14-3-4-4-13-6 14-4 22-5 8 0-1 5 21 0-8-6-12-4-7-5-10-4-14-4 6-5 18 0 12-5 3-5 10-4 10-1 19-5 9 1 15-6 15 3 8 4 4-2 17 1-1 2 16 2 10-1 21 3 19 1 8 1 13-2 15 3 11 2 19 2 16 5 10 1 9-4 12-3 15 1 15-4 16-3 7 4 7-2 3-5 7 1 8 5 8 4 14-7 1 8 12-2 4-3 12 1 16 4 23 4 14 2 10-1 13 5-14 5 18 2 27-1 9-2 10 6 11-5-10-4 6-4 12 0 9-1 8 2 10 6 11-1 17 5 16-2 15 0-2-6 9-2 16 4 0 9 6-8 8 0 5-10-11-6-12-4 1-11 12-7 13 1 10 5 7 5 7 6-9 5zm-237-36l-5 4 23-3 13 5 12-5 9 4 8 9 5-4-7-10 9-1 10 1 11 4 6 10 3 7 17 5 18 5-1 4-16 1 6 4-3 3-18-1-18-3-11 1-19 3-30 2-13 1-6-5-13-3-9 1-12-8 6-1 16-1 14 0 13-2-19-2-22 1-14 0-5-4 23-4-16 0-17-3 8-7 7-4 27-6zm97-3l-9 6-15-7 3-1 13 0zm282 3l0 3-10-1-11 0-11 2-3-1-11-5 1-4 4-1 23 1zm-103-1l8 7 9-8 26-5 9 6 8 5-2 6 20-3 10-4 22 6 14 4 1 5 19-3 10 7 24 4 9 4 9 9-18 5 23 6 16 3 15 9 15 0-3 7-9 6-8 6-12-4-16-10-13 1-1 6 10 6 14 5 4 2 6 10-3 7-13-2-12-5-13-3 14 8 11 6 1 4-27-4-21-6-12-5 3-3-15-5-14-5 0 3-29 2-9-4 7-7 19 0 20-2-3-3 4-5 12-10-2-4-4-4-15-5-21-3 7-2-11-7-9 0-8-4-5 3-18 2-36-3-22-3-16-1-8-4 10-4-14 0-3-10 8-9 10-4 26-3zm-138-6l12 2 18-2 3 3-10 5 16 4-2 9-17 4-9-1-7-3-12-4-13-4 0-3 21 1-11-7zm2440 6l-15 0-21-1-1-1 9-4 13-1 14 4zm-2368 4l-11 8-11-1-6-8 0-5 5-5 10-2 21 0 19 2-8 5-7 4zm-273 14l-26 5-5-4-23-6 3-3 8-8 9-7-10-6 34-1 14 2 25 0 10 3 11 4-13 3-12 3-12 4-13 7zm2710-36l-9 3-16-1-11-2 36 0zm-2441 0l-6 4-14-1-12-2 1-1 31 0zm2381 0l-2 2-37 0-16 2-12-4 67 0zm-2427 0l-16 1-7-1 23 0zm-82 0l-33 1-25 5-15 0-2-3 13-3 62 0zm1671 0l-7 2-15 5-8 5-7 5-8 4-8 5 2 9 10 4 9 4-6 1-32-2-3-4-18-3-1-5 10-2-1-6 10-4 10-4-9-2 12-4 12-4-2-4 50 0zm-1406 0l1 1-7 2-14 3-13-2-29 2-20 0-17-1-26-3-1-2 126 0zm595 0l4 3 6 4-22 1 12 4-4 3-14 2-14 0 13 7 0 4-20-4-5 3 14 2 13 6 3 8-17 2-8-4-12-5 3 6-12 6 27 0 14 1-14 4-13 4-14 4-13 4-30 4-11 0-10 4-7 5-7 5-22 7-6 1-14 2-14 2-9 7 0 7-5 6-16 8 4 8-5 8-5 10-14 1-15-9-20 0-9-5-7-10-8-6-9-6-5-7-2-9-14-9 4-7-7-4 10-12 15-3 4-4 2-8-11 3-6 2-9 1-12-3-1-7 4-5 10 0 20 2-17-6-9-3-10 1-8-3 11-9-6-4-8-7-6-5-6-5-10-3 379 0z' };
} catch (e) { console.error('Open World Clock: views/world-land.js failed to start', e); }

/* ---------- src/renderer/views/map.js ---------- */
try {
// World map view: land outline, live day/night terminator, sun, and one dot per clock zone.
// API: window.WCMap = { mount(container, api), update(state), unmount() }
//   api   = { setSource(zone), labelOf(zone), onHover(zoneOrNull) }
//   state = { zones, localZone, date, converting, sourceZone, hour12, lang, locale }
// update() is called every tick; it only touches the DOM when something visible changed.
// Pure helpers are exposed on window.WCMap._internals for unit tests (no DOM at load time).
(function () {
  'use strict';
  const rad = Math.PI / 180;
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- solar geometry (same formulas as sun.js, so night/day agrees with WCSun.isDay; SunCalc-derived, BSD-2, see the notice in sun.js) ----------
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const OBLIQ = rad * 23.4397;
  const SUNSET_ALT = -0.833; // degrees; WCSun uses the same threshold
  const TWI_HI = 0.5; // shading starts just before sunset...
  const TWI_CIVIL = -6; // ...reaches ~half strength at the end of civil twilight...
  const TWI_LO = -12; // ...and is full night at nautical dusk.

  const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

  // Subsolar point (where the sun is at the zenith) for an instant: { lat, lng } in degrees.
  function subsolar(date) {
    const d = date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(OBLIQ) * Math.sin(L));
    const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQ), Math.cos(L));
    const theta = rad * (280.16 + 360.9856235 * d); // Greenwich sidereal angle
    return { lat: dec / rad, lng: wrapLng((ra - theta) / rad) };
  }

  // Sun altitude (degrees) at lat/lng given a subsolar point.
  function altitude(lat, lng, ss) {
    const p = lat * rad, dec = ss.lat * rad;
    const s = Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos((lng - ss.lng) * rad);
    return Math.asin(Math.max(-1, Math.min(1, s))) / rad;
  }
  const isNight = (date, lat, lng) => altitude(lat, lng, subsolar(date)) <= SUNSET_ALT;

  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  // 0 = full day, 1 = full night, with a soft civil-twilight band in between.
  function nightAlpha(alt) {
    if (alt >= TWI_HI) return 0;
    if (alt <= TWI_LO) return 1;
    if (alt >= TWI_CIVIL) return 0.5 * smooth((TWI_HI - alt) / (TWI_HI - TWI_CIVIL));
    return 0.5 + 0.5 * smooth((TWI_CIVIL - alt) / (TWI_CIVIL - TWI_LO));
  }

  // Latitude of the terminator for a longitude (handy for tests and debugging).
  function terminatorLat(lng, ss) {
    const dec = (Math.abs(ss.lat) < 1e-6 ? 1e-6 : ss.lat) * rad;
    return Math.atan(-Math.cos((lng - ss.lng) * rad) / Math.tan(dec)) / rad;
  }

  // ---------- geometry ----------
  function coordsOf(zone, win) {
    const w = win || (typeof window !== 'undefined' ? window : {});
    const m = w.ZONE_META && w.ZONE_META[zone];
    if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) return { lat: m.lat, lng: m.lng };
    const c = w.ZONE_COORDS && w.ZONE_COORDS[zone];
    if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) return { lat: c[0], lng: c[1] };
    return null;
  }

  // Longitude to put at the middle of the view: opposite the widest empty gap between cities,
  // so the map seam never cuts through a group of cities.
  function pickCenter(lngs) {
    const xs = (lngs || []).filter(Number.isFinite).map(wrapLng).sort((a, b) => a - b);
    if (!xs.length) return 10;
    if (xs.length === 1) return xs[0];
    let best = -1, seam = 180;
    for (let i = 0; i < xs.length; i++) {
      const a = xs[i], b = i + 1 < xs.length ? xs[i + 1] : xs[0] + 360;
      if (b - a > best) { best = b - a; seam = (a + b) / 2; }
    }
    return wrapLng(seam + 180);
  }

  // Map frame for a container: px per degree (sx, sy), visible latitude window, content width, x of lng -180.
  // Wide short strips: the latitude window shrinks to the cities (70..133 deg) and x may stretch up to 35%;
  // any width left over shows the wrapped world (faded) on both sides.
  // Narrow tall views (vertical layout): the content is wider than the container and scrolls horizontally.
  const STRETCH = 1.35;
  function viewport(W, H, pts, bounds) {
    const N = (bounds && bounds.north) || 75, S = (bounds && bounds.south) || -58;
    const full = N - S, pad = Math.min(16, H * 0.1); // pills sit left/right of dots, so little vertical pad is needed
    const lats = (pts || []).map((p) => p.lat);
    const span = lats.length ? Math.max(1, Math.max(...lats) - Math.min(...lats)) : full;
    let sy = Math.min(H / 70, (H - 2 * pad) / span);
    sy = Math.max(sy, H / full);
    // too narrow to show the whole world anyway (vertical layout): show every latitude and scroll sideways
    if (W / 360 < sy) sy = Math.max(H / full, W / 360);
    const Lv = H / sy;
    const mid = lats.length ? (Math.max(...lats) + Math.min(...lats)) / 2 : (N + S) / 2;
    const top = Math.min(N, Math.max(S + Lv, mid + Lv / 2));
    const sx = Math.min(Math.max(W / 360, sy), sy * STRETCH);
    const worldW = 360 * sx;
    const Cw = Math.max(W, worldW);
    const centerLng = pickCenter((pts || []).map((p) => p.lng));
    const x0 = Cw / 2 - (centerLng + 180) * sx;
    return { W, H, sx, sy, top, worldW, Cw, x0, centerLng, scroll: worldW > W + 0.5, north: N, south: S };
  }

  function project(vp, lat, lng) {
    let x = vp.x0 + (lng + 180) * vp.sx;
    const lo = vp.Cw / 2 - vp.worldW / 2;
    x = lo + ((((x - lo) % vp.worldW) + vp.worldW) % vp.worldW);
    return { x, y: (vp.top - lat) * vp.sy };
  }
  function unproject(vp, x, y) {
    return { lat: vp.top - y / vp.sy, lng: wrapLng((x - vp.x0) / vp.sx - 180) };
  }

  // Greedy label placement. items: [{ x, y, w, h }] in priority order.
  // Returns [{ side: 'r'|'l'|'t'|'b'|'tr'|'tl'|'br'|'bl'|null, dx, dy, fallback }]: dx/dy offset the pill's top-left
  // from the dot. Sides are tried in order; the diagonals rescue dots near an edge or a neighbour.
  const GAP = 8, DOT = 5;
  const SIDES = ['r', 'l', 't', 'b', 'tr', 'tl', 'br', 'bl'];
  function offsetFor(side, w, h) {
    const d = GAP * 0.7;
    if (side === 'r') return { dx: GAP, dy: -h / 2 };
    if (side === 'l') return { dx: -GAP - w, dy: -h / 2 };
    if (side === 't') return { dx: -w / 2, dy: -GAP - h };
    if (side === 'tr') return { dx: d, dy: -d - h };
    if (side === 'tl') return { dx: -d - w, dy: -d - h };
    if (side === 'br') return { dx: d, dy: d };
    if (side === 'bl') return { dx: -d - w, dy: d };
    return { dx: -w / 2, dy: GAP };
  }
  function placeLabels(items, bounds) {
    const B = bounds || { x: 0, y: 0, w: Infinity, h: Infinity };
    const taken = items.map((it) => ({ x: it.x - DOT, y: it.y - DOT, w: DOT * 2, h: DOT * 2 }));
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const inside = (r) => r.x >= B.x + 2 && r.y >= B.y + 2 && r.x + r.w <= B.x + B.w - 2 && r.y + r.h <= B.y + B.h - 2;
    return items.map((it, i) => {
      let fallback = null;
      for (const side of SIDES) {
        const o = offsetFor(side, it.w, it.h);
        const r = { x: it.x + o.dx - 2, y: it.y + o.dy - 1, w: it.w + 4, h: it.h + 2 };
        if (!inside(r)) continue;
        if (!fallback) fallback = { side, dx: o.dx, dy: o.dy };
        if (taken.some((t, j) => j !== i && hit(r, t))) continue;
        taken.push(r);
        return { side, dx: o.dx, dy: o.dy, fallback: null };
      }
      // Hidden (shown on hover/focus). Keep that hover position inside the map so it is never cut off.
      let f = fallback;
      if (!f) {
        const o = offsetFor(it.x > B.x + B.w / 2 ? 'l' : 'r', it.w, it.h);
        const cx = Math.max(B.x + 2, Math.min(it.x + o.dx, B.x + B.w - it.w - 2));
        const cy = Math.max(B.y + 2, Math.min(it.y + o.dy, B.y + B.h - it.h - 2));
        f = { side: 'r', dx: Number.isFinite(cx) ? cx - it.x : o.dx, dy: Number.isFinite(cy) ? cy - it.y : o.dy };
      }
      return { side: null, dx: f.dx, dy: f.dy, fallback: f.side };
    });
  }

  // ---------- time formatting ----------
  const fmtCache = new Map();
  function formatTime(zone, date, hour12, locale) {
    const key = zone + '|' + (hour12 ? 1 : 0) + '|' + (locale || '');
    let f = fmtCache.get(key);
    if (!f) {
      const opts = hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' };
      opts.timeZone = zone;
      try { f = new Intl.DateTimeFormat(locale || undefined, opts); } catch { f = new Intl.DateTimeFormat('en-US', opts); }
      if (fmtCache.size > 400) fmtCache.clear();
      fmtCache.set(key, f);
    }
    return f.format(date);
  }
  const cityName = (zone) => {
    const m = typeof window !== 'undefined' && window.ZONE_META && window.ZONE_META[zone];
    return (m && m.city) || String(zone).split('/').pop().replace(/_/g, ' ');
  };

  // ---------- view ----------
  let V = null; // mounted view state
  let seq = 0;

  const el = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  const svg = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function mount(container, api) {
    if (V) unmount();
    if (!container) return;
    const land = window.WCWorldLand || { width: 3600, height: 1330, north: 75, south: -58, d: '' };
    const id = 'wcmap-land-' + (++seq);
    const root = el('div', 'wc-map instant');
    // No role/label here: the #mapView container carries the translated label.
    const scroller = el('div', 'map-scroll', root);
    const content = el('div', 'map-content', scroller);
    const svgEl = svg('svg', { class: 'map-land', 'aria-hidden': 'true', focusable: 'false' }, content);
    const defs = svg('defs', {}, svgEl);
    svg('path', { id, d: land.d }, defs);
    const copies = svg('g', { class: 'map-copies' }, svgEl);
    const equator = svg('line', { class: 'map-equator', x1: 0, x2: 0, y1: 0, y2: 0, 'vector-effect': 'non-scaling-stroke' }, svgEl);
    const glow = el('div', 'map-glow', content);
    const nightA = el('canvas', 'map-night on', content);
    const nightB = el('canvas', 'map-night', content);
    const sun = el('div', 'map-sun', content);
    const cities = el('div', 'map-cities', content);
    container.appendChild(root);

    V = {
      container, api: api || {}, land, id, root, scroller, content, svgEl, copies, equator, glow, sun, cities,
      canvases: [nightA, nightB], front: 0,
      nodes: new Map(), // zone -> { btn, dot, pill, name, time, name$, time$, w, h, x, y, cls }
      state: null, vp: null, geoKey: '', zonesKey: '', ss: null, drawnSs: null, sunKey: '', needLabels: true,
      nightColor: '', hover: null, raf: 0, instantTimer: 0,
    };

    cities.addEventListener('click', onClick);
    cities.addEventListener('mouseover', onOver);
    cities.addEventListener('mouseout', onOut);
    cities.addEventListener('focusin', onOver);
    cities.addEventListener('focusout', onOut);
    scroller.addEventListener('wheel', onWheel, { passive: false });

    V.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule(true)) : null;
    if (V.ro) V.ro.observe(root);
    V.mo = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (V) { V.nightColor = ''; schedule(false); } }) : null;
    if (V.mo) V.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    try {
      V.mq = window.matchMedia('(prefers-color-scheme: dark)');
      V.onScheme = () => { if (V) { V.nightColor = ''; schedule(false); } };
      V.mq.addEventListener('change', V.onScheme);
    } catch { V.mq = null; }
    requestAnimationFrame(() => { if (V && V.root === root) root.classList.remove('instant'); });
  }

  function unmount() {
    if (!V) return;
    const v = V;
    V = null;
    if (v.ro) v.ro.disconnect();
    if (v.mo) v.mo.disconnect();
    if (v.mq && v.onScheme) v.mq.removeEventListener('change', v.onScheme);
    cancelAnimationFrame(v.raf);
    clearTimeout(v.instantTimer);
    if (v.hover && v.api.onHover) { try { v.api.onHover(null); } catch { /* ignore */ } }
    v.root.remove();
  }

  // Re-render outside update() (resize, theme change). Resizes skip transitions so nothing swims.
  function schedule(resized) {
    if (!V) return;
    if (resized) {
      V.root.classList.add('instant');
      clearTimeout(V.instantTimer);
      V.instantTimer = setTimeout(() => V && V.root.classList.remove('instant'), 180);
    }
    if (V.raf) return;
    V.raf = requestAnimationFrame(() => { if (!V) return; V.raf = 0; if (V.state) render(); });
  }

  const cityOf = (t) => (t && t.closest ? t.closest('.map-city') : null);
  function onClick(e) {
    const b = cityOf(e.target);
    if (!b || !V) return;
    e.preventDefault();
    if (V.api.setSource) V.api.setSource(b.dataset.zone);
  }
  function setHover(zone) {
    if (!V || V.hover === zone) return;
    if (V.hover && V.nodes.get(V.hover)) V.nodes.get(V.hover).btn.classList.remove('is-hover');
    V.hover = zone;
    if (zone && V.nodes.get(zone)) V.nodes.get(zone).btn.classList.add('is-hover');
    V.root.classList.toggle('hovering', !!zone);
    if (V.api.onHover) { try { V.api.onHover(zone); } catch (err) { console.warn('map hover', err); } }
  }
  function onOver(e) { const b = cityOf(e.target); if (b) setHover(b.dataset.zone); }
  function onOut(e) {
    const b = cityOf(e.target);
    if (!b) return;
    const to = cityOf(e.relatedTarget);
    if (to === b) return;
    if (e.type === 'focusout' && V && V.root.contains(document.activeElement) && cityOf(document.activeElement)) return;
    setHover(to ? to.dataset.zone : null);
  }
  function onWheel(e) {
    if (!V || !V.vp || !V.vp.scroll) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { V.scroller.scrollLeft += e.deltaY; e.preventDefault(); }
  }

  function update(state) {
    if (!V || !state) return;
    V.state = state;
    render();
  }

  function render() {
    const v = V, st = v.state;
    const W = v.root.clientWidth, H = v.root.clientHeight;
    if (!W || !H) return; // hidden; ResizeObserver re-renders when shown
    const date = st.date instanceof Date ? st.date : new Date(st.date != null ? st.date : Date.now());
    if (!Number.isFinite(date.getTime())) return;
    const zones = Array.isArray(st.zones) ? st.zones : [];
    const locale = st.locale || st.lang || undefined;

    // 1. city nodes (only rebuilt when the zone list changes)
    const zonesKey = zones.join('|');
    if (zonesKey !== v.zonesKey) { syncNodes(zones); v.zonesKey = zonesKey; v.needLabels = true; }
    const pts = [];
    for (const z of zones) { const n = v.nodes.get(z); if (n && n.c) pts.push(n.c); }

    // 2. frame
    const geoKey = [W, H, pts.map((p) => p.lat + ',' + p.lng).join(';')].join('|');
    let geoChanged = false;
    if (geoKey !== v.geoKey) {
      const prevScroll = v.vp && v.vp.scroll;
      v.vp = viewport(W, H, pts, v.land);
      v.geoKey = geoKey;
      geoChanged = true;
      layoutFrame(prevScroll !== v.vp.scroll || !prevScroll);
    }
    const vp = v.vp;

    // 3. sun + night shading
    const ss = subsolar(date);
    // Only converter jumps glide; the live minute step jumps (no 700 ms transform transition every minute).
    placeSun(ss, geoChanged || !st.converting);
    if (!v.nightColor) { readColors(); v.drawnSs = null; }
    const moved = v.drawnSs ? Math.max(Math.abs(wrapLng(ss.lng - v.drawnSs.lng)), Math.abs(ss.lat - v.drawnSs.lat)) : Infinity;
    if (geoChanged || moved > 0.05) drawNight(ss, !geoChanged && moved > 1.5 && moved !== Infinity);

    // 4. per-city text + classes
    const home = st.localZone, src = st.converting ? st.sourceZone : null;
    let textChanged = false;
    for (const z of zones) {
      const n = v.nodes.get(z);
      if (!n || !n.c) continue;
      let label = '';
      try { label = v.api.labelOf ? v.api.labelOf(z) : ''; } catch { label = ''; }
      label = label || cityName(z);
      const time = formatTime(z, date, !!st.hour12, locale);
      if (label !== n.name$) { n.name.textContent = label; n.name$ = label; textChanged = true; }
      if (time !== n.time$) { n.time.textContent = time; n.time$ = time; textChanged = true; }
      const night = altitude(n.c.lat, n.c.lng, ss) <= SUNSET_ALT;
      const cls = (z === home ? 'H' : '') + (z === src ? 'S' : '') + (night ? 'N' : '');
      if (cls !== n.cls) {
        n.btn.classList.toggle('home', z === home);
        n.btn.classList.toggle('source', z === src);
        n.btn.classList.toggle('is-night', night);
        if (cls.replace('N', '') !== n.cls.replace('N', '')) v.needLabels = true; // priority changed
        n.cls = cls;
      }
      if (textChanged || n.aria !== label + time) { n.btn.setAttribute('aria-label', label + ', ' + time); n.aria = label + time; }
      if (geoChanged) {
        const p = project(vp, n.c.lat, n.c.lng);
        n.x = p.x; n.y = p.y;
        n.btn.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }
    }

    // 5. labels (measure only after text or frame changes)
    if (textChanged || geoChanged || v.needLabels) layoutLabels(zones, home, src);
  }

  function syncNodes(zones) {
    const v = V;
    const keep = new Set(zones);
    for (const [z, n] of v.nodes) if (!keep.has(z)) { n.btn.remove(); v.nodes.delete(z); if (v.hover === z) setHover(null); }
    for (const z of zones) {
      if (v.nodes.has(z)) continue;
      const btn = el('button', 'map-city');
      btn.type = 'button';
      btn.dataset.zone = z;
      btn.tabIndex = 0;
      const dot = el('span', 'map-dot', btn);
      const pill = el('span', 'map-pill', btn);
      const name = el('span', 'map-name', pill);
      const time = el('span', 'map-time', pill);
      const c = coordsOf(z);
      if (!c) btn.hidden = true;
      v.nodes.set(z, { btn, dot, pill, name, time, name$: '', time$: '', c, cls: '', w: 0, h: 0, x: 0, y: 0, side: '' });
    }
    // DOM order = tab order = zones order
    for (const z of zones) v.cities.appendChild(v.nodes.get(z).btn);
  }

  function layoutFrame(recenter) {
    const v = V, vp = v.vp, L = v.land;
    v.root.classList.toggle('is-scroll', vp.scroll);
    v.content.style.width = vp.Cw + 'px';
    v.content.style.height = vp.H + 'px';
    v.svgEl.setAttribute('viewBox', `0 0 ${vp.Cw.toFixed(1)} ${vp.H.toFixed(1)}`);
    v.svgEl.setAttribute('width', vp.Cw.toFixed(1));
    v.svgEl.setAttribute('height', vp.H.toFixed(1));
    const upd = L.width / 360;
    const kx = vp.sx / upd, ky = vp.sy / upd;
    const ty = (vp.top - L.north) * vp.sy;
    const first = Math.floor(-vp.x0 / vp.worldW), last = Math.ceil((vp.Cw - vp.x0) / vp.worldW) - 1;
    while (v.copies.firstChild) v.copies.firstChild.remove();
    for (let k = first; k <= last; k++) {
      svg('use', { href: '#' + v.id, transform: `translate(${(vp.x0 + k * vp.worldW).toFixed(2)} ${ty.toFixed(2)}) scale(${kx.toFixed(5)} ${ky.toFixed(5)})` }, v.copies);
    }
    // wrapped copies beyond the primary world fade out, so the repeat reads as "the globe continues"
    const lo = (vp.Cw - vp.worldW) / 2;
    const mask = lo > 4 ? `linear-gradient(90deg, rgb(0 0 0 / 0.28) 0px, #000 ${lo.toFixed(0)}px, #000 ${(vp.Cw - lo).toFixed(0)}px, rgb(0 0 0 / 0.28) ${vp.Cw.toFixed(0)}px)` : '';
    v.svgEl.style.webkitMaskImage = mask;
    v.svgEl.style.maskImage = mask;
    const ye = (vp.top * vp.sy).toFixed(1);
    v.equator.setAttribute('x2', vp.Cw.toFixed(1));
    v.equator.setAttribute('y1', ye);
    v.equator.setAttribute('y2', ye);
    const r = Math.max(vp.sx, vp.sy) * 80;
    v.glow.style.width = v.glow.style.height = (2 * r).toFixed(0) + 'px';
    v.glow.style.marginLeft = v.glow.style.marginTop = (-r).toFixed(0) + 'px';
    for (const c of v.canvases) { c.style.width = vp.Cw + 'px'; c.style.height = vp.H + 'px'; }
    if (recenter && vp.scroll) {
      // start with the home city in the middle (falls back to the middle of the cities)
      const hn = v.state && v.nodes.get(v.state.localZone);
      const hx = hn && hn.c ? project(vp, hn.c.lat, hn.c.lng).x : vp.Cw / 2;
      v.scroller.scrollLeft = Math.max(0, Math.min(vp.Cw - vp.W, hx - vp.W / 2));
    }
    v.needLabels = true;
  }

  function placeSun(ss, instant) {
    const v = V, vp = v.vp;
    const lat = Math.max(vp.top - vp.H / vp.sy + 1, Math.min(vp.top - 1, ss.lat));
    const p = project(vp, lat, ss.lng);
    const key = p.x.toFixed(1) + ',' + p.y.toFixed(1);
    if (key === v.sunKey) return;
    // a jump across the seam (or a resize) must not slide across the whole map
    const jump = v.sunPos && Math.abs(p.x - v.sunPos.x) > vp.worldW / 3;
    if (jump || instant) { v.sun.classList.add('no-anim'); v.glow.classList.add('no-anim'); }
    const t = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    v.sun.style.transform = t;
    v.glow.style.transform = t;
    if (jump || instant) {
      void v.sun.offsetWidth; // commit the jump before re-enabling transitions
      v.sun.classList.remove('no-anim');
      v.glow.classList.remove('no-anim');
    }
    v.sunKey = key;
    v.sunPos = p;
  }

  function readColors() {
    const cs = getComputedStyle(V.root);
    V.nightColor = cs.getPropertyValue('--map-night').trim() || 'rgb(20, 30, 70)';
    const a = parseFloat(cs.getPropertyValue('--map-night-alpha'));
    V.nightMax = Number.isFinite(a) ? a : 0.55;
  }

  const CELL = 5; // CSS px per shading sample; the browser's bilinear upscale keeps the edge soft
  function drawNight(ss, crossfade) {
    const v = V, vp = v.vp;
    const fade = crossfade && !reduced();
    const idx = fade ? 1 - v.front : v.front;
    const cv = v.canvases[idx];
    const cw = Math.max(2, Math.ceil(vp.Cw / CELL) + 1), ch = Math.max(2, Math.ceil(vp.H / CELL) + 1);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(cw, ch);
    const data = img.data;
    const sd = Math.sin(ss.lat * rad), cd = Math.cos(ss.lat * rad);
    const cosH = new Float32Array(cw);
    // sample centres are spread so the first/last samples land on the content edges
    const fx = vp.Cw / (cw - 1), fy = vp.H / (ch - 1);
    for (let i = 0; i < cw; i++) cosH[i] = Math.cos(((i * fx - vp.x0) / vp.sx - 180 - ss.lng) * rad);
    const maxA = 255 * v.nightMax;
    for (let j = 0; j < ch; j++) {
      const lat = (vp.top - (j * fy) / vp.sy) * rad;
      const a = Math.sin(lat) * sd, b = Math.cos(lat) * cd;
      let o = j * cw * 4 + 3;
      for (let i = 0; i < cw; i++, o += 4) {
        const alt = Math.asin(Math.max(-1, Math.min(1, a + b * cosH[i]))) / rad;
        data[o] = maxA * nightAlpha(alt);
      }
    }
    ctx.globalCompositeOperation = 'copy';
    ctx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = v.nightColor;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    // canvas pixels are sample points; stretch so sample i sits at x = i * fx
    cv.style.width = (cw * fx).toFixed(1) + 'px';
    cv.style.height = (ch * fy).toFixed(1) + 'px';
    cv.style.transform = `translate(${(-fx / 2).toFixed(2)}px, ${(-fy / 2).toFixed(2)}px)`;
    if (fade) {
      v.canvases[idx].classList.add('on');
      v.canvases[1 - idx].classList.remove('on');
      v.front = idx;
    }
    v.drawnSs = ss;
  }

  function layoutLabels(zones, home, src) {
    const v = V, vp = v.vp;
    const list = zones.map((z) => v.nodes.get(z)).filter((n) => n && n.c);
    // measure (one read pass after all writes)
    for (const n of list) { n.w = n.pill.offsetWidth; n.h = n.pill.offsetHeight; }
    if (list.some((n) => !n.w)) return; // not laid out yet
    const rank = (n) => (n.btn.dataset.zone === home ? 0 : n.btn.dataset.zone === src ? 1 : 2);
    const order = list.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map((o) => o.n);
    const bounds = vp.scroll ? { x: 0, y: 0, w: vp.Cw, h: vp.H } : { x: 0, y: 0, w: vp.W, h: vp.H };
    const res = placeLabels(order.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })), bounds);
    order.forEach((n, k) => {
      const r = res[k];
      const side = r.side || 'off';
      if (side !== n.side) {
        n.btn.classList.remove(...SIDES.map((s) => 'at-' + s), 'at-off');
        n.btn.classList.add('at-' + side);
        n.side = side;
      }
      n.pill.style.transform = `translate(${r.dx.toFixed(1)}px, ${r.dy.toFixed(1)}px)`;
    });
    v.needLabels = false;
  }

  const api = {
    mount, update, unmount,
    _internals: { subsolar, altitude, isNight, nightAlpha, terminatorLat, coordsOf, pickCenter, viewport, project, unproject, placeLabels, formatTime, wrapLng, SUNSET_ALT },
  };
  if (typeof window !== 'undefined') window.WCMap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
} catch (e) { console.error('Open World Clock: views/map.js failed to start', e); }

