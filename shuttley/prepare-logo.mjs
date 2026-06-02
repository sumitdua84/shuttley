// Crops the logo to graphic-only (no text) for PWA icons
// Run: node prepare-logo.mjs

import sharp from './node_modules/sharp/lib/index.js'
import { copyFileSync } from 'fs'

const src = '../../logo-source.png' // relative to App/shuttley

// Get image dimensions first
const meta = await sharp(src).metadata()
const W = meta.width
const H = meta.height

console.log(`Source: ${W}x${H}`)

// The graphic (racket + shuttle) sits in the top ~62% of the image
// Text lives in the bottom ~38%
const cropH = Math.round(H * 0.62)

await sharp(src)
  .extract({ left: 0, top: 0, width: W, height: cropH })
  .resize(512, 512, { fit: 'cover', position: 'centre' })
  .toFile('public/icon-source.png')

console.log('✅ Cropped icon saved to public/icon-source.png')

// Also copy full logo for use in the app
copyFileSync(src, 'public/logo-source.png')
console.log('✅ Full logo copied to public/logo-source.png')
