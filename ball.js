/* ==========================================================
   Run Detroit — 3D basketball
   A real WebGL sphere: leather colour, pebble bump, seam
   grooves, studio lighting, idle spin and drag-to-throw.
   Falls back silently to the flat mark if WebGL is absent.
   ========================================================== */
import * as THREE from "./assets/vendor/three.module.min.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountBall(host){
  if(!host) return null;

  let renderer;
  try{
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
  }catch(e){ return null; }
  if(!renderer.getContext()) return null;

  const size = () => Math.max(1, Math.min(host.clientWidth, host.clientHeight));
  const dpr  = Math.min(2, window.devicePixelRatio || 1);

  renderer.setPixelRatio(dpr);
  renderer.setSize(size(), size(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
  host.appendChild(renderer.domElement);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0, 6.4);

  const tex = new THREE.TextureLoader();
  const load = (src, srgb) => {
    const t = tex.load(src);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.wrapS = THREE.RepeatWrapping;
    if(srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1.52, 96, 96),
    new THREE.MeshStandardMaterial({
      map:          load("assets/ball-color.jpg", true),
      bumpMap:      load("assets/ball-bump.jpg"),
      bumpScale:    0.035,
      roughnessMap: load("assets/ball-rough.jpg"),
      roughness:    0.82,
      metalness:    0.02,
      color:        0xffffff
    })
  );
  ball.rotation.set(0.42, 0.6, 0.12);
  scene.add(ball);

  /* Studio rig: warm key, cool fill, hot rim. */
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2b1206, 0.85));
  const key = new THREE.DirectionalLight(0xfff2e2, 2.5);  key.position.set(3.2, 4.0, 4.2);
  const fil = new THREE.DirectionalLight(0x9db8ff, 0.95); fil.position.set(-4.0, -1.0, 2.2);
  const rim = new THREE.DirectionalLight(0xffd9c2, 2.2);  rim.position.set(-2.4, 2.6, -4.2);
  scene.add(key, fil, rim);

  /* Motion: steady idle spin, plus flick-to-throw with momentum. */
  let vx = 0.0042, vy = 0.0125;
  const IDLE_X = 0.0042, IDLE_Y = 0.0125;
  let dragging = false, lastX = 0, lastY = 0, lastT = 0;

  const el = renderer.domElement;
  const down = (e) => {
    dragging = true; el.setPointerCapture?.(e.pointerId);
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
  };
  const move = (e) => {
    if(!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    ball.rotation.y += dx * 0.009;
    ball.rotation.x += dy * 0.009;
    const dt = Math.max(8, performance.now() - lastT);
    vy = (dx * 0.009) / dt * 16;
    vx = (dy * 0.009) / dt * 16;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
  };
  const up = (e) => { dragging = false; el.releasePointerCapture?.(e.pointerId); };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);

  let raf = 0;
  const awake = () => document.visibilityState !== "hidden";

  function resize(){
    const s = size();
    renderer.setSize(s, s, false);
    camera.aspect = 1; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);

  function frame(){
    raf = requestAnimationFrame(frame);
    if(!awake()) return;
    if(!dragging){
      // ease back to the idle spin after a flick
      vy += (IDLE_Y - vy) * 0.022;
      vx += (IDLE_X - vx) * 0.022;
      ball.rotation.y += vy;
      ball.rotation.x += vx;
      // keep the tilt from tumbling all the way over
      ball.rotation.x += (0.30 - ball.rotation.x) * 0.004;
    }
    renderer.render(scene, camera);
  }

  if(reduced){ resize(); renderer.render(scene, camera); }
  else frame();

  return {
    destroy(){
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.dispose();
      ball.geometry.dispose();
      Object.values(ball.material).forEach(v => v?.isTexture && v.dispose());
      ball.material.dispose();
      host.innerHTML = "";
    }
  };
}

window.RunDetroitBall = { mount: mountBall };
window.dispatchEvent(new Event("ball-ready"));
