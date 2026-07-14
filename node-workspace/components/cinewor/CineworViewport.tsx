import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  CineworCameraShot,
  CineworSceneState,
  CineworVector3,
} from "../../../types";
import {
  sampleCineworActor,
  sampleCineworTrajectory,
} from "../../../utils/cineworWorkspace";

export type CineworCameraPose = {
  position: CineworVector3;
  target: CineworVector3;
  fov: number;
};

export type CineworViewportHandle = {
  captureCamera: () => CineworCameraPose;
  exportFrame: (ratio: "16:9" | "2.39:1") => string | null;
  resetView: () => void;
};

type Props = {
  scene: CineworSceneState;
  time: number;
  selectedActorId?: string;
  selectedShotId?: string;
  viewMode: "world" | "shot";
  onReady?: () => void;
  onError?: (message: string) => void;
};

type Runtime = {
  renderer: THREE.WebGLRenderer;
  world: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  actors: Map<string, THREE.Group>;
  actorMaterials: Map<string, THREE.MeshStandardMaterial>;
  shotHelpers: Map<string, THREE.CameraHelper>;
  selectedShotId?: string;
  viewMode: "world" | "shot";
  activeShot?: CineworCameraShot;
  observer: ResizeObserver;
  raf: number;
};

const vector3 = (value: CineworVector3) => new THREE.Vector3(value[0], value[1], value[2]);
const tuple = (value: THREE.Vector3): CineworVector3 => [value.x, value.y, value.z];

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose());
  });
};

const createActor = (trackId: string, color: string, label: string) => {
  const group = new THREE.Group();
  group.name = `actor:${trackId}`;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.05,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).offsetHSL(0, -0.08, 0.16),
    roughness: 0.66,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.72, 5, 12), material);
  torso.position.y = 1.1;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 12), accent);
  head.position.y = 1.94;
  head.castShadow = true;
  const facing = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 10), accent);
  facing.rotation.x = Math.PI / 2;
  facing.position.set(0, 1.72, 0.42);
  group.add(torso, head, facing);
  group.userData.label = label;
  return { group, material };
};

const addActorPath = (content: THREE.Group, scene: CineworSceneState, actorId: string) => {
  const track = scene.actors.find((actor) => actor.id === actorId);
  if (!track || track.keyframes.length < 2) return;
  const points: THREE.Vector3[] = [];
  for (let segment = 1; segment < track.keyframes.length; segment += 1) {
    const from = track.keyframes[segment - 1];
    const to = track.keyframes[segment];
    for (let step = 0; step <= 20; step += 1) {
      points.push(vector3(sampleCineworTrajectory(
        from.position,
        to.position,
        step / 20,
        track.trajectory,
        track.arcHeight,
      )).add(new THREE.Vector3(0, 0.03, 0)));
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({ color: track.color, dashSize: 0.24, gapSize: 0.14 });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.name = `path:${track.id}`;
  content.add(line);

  track.keyframes.forEach((frame) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshBasicMaterial({ color: track.color }),
    );
    marker.position.copy(vector3(frame.position)).add(new THREE.Vector3(0, 0.08, 0));
    marker.name = `keyframe:${frame.id}`;
    content.add(marker);
  });
};

const buildScene = (runtime: Runtime, scene: CineworSceneState, selectedActorId?: string) => {
  disposeObject(runtime.content);
  runtime.content.clear();
  runtime.actors.clear();
  runtime.actorMaterials.clear();
  runtime.shotHelpers.clear();

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x343b3c, roughness: 0.96 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(scene.stage.width, scene.stage.depth), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  runtime.content.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x454c4d, roughness: 0.92 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(scene.stage.width, scene.stage.height), wallMaterial);
  wall.position.set(0, scene.stage.height / 2, -scene.stage.depth / 2);
  runtime.content.add(wall);

  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(scene.stage.depth, scene.stage.height), wallMaterial.clone());
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(-scene.stage.width / 2, scene.stage.height / 2, 0);
  runtime.content.add(sideWall);

  if (scene.stage.gridVisible) {
    const grid = new THREE.GridHelper(
      Math.max(scene.stage.width, scene.stage.depth),
      Math.max(8, Math.round(Math.max(scene.stage.width, scene.stage.depth))),
      0x6f817d,
      0x56605f,
    );
    grid.position.y = 0.008;
    runtime.content.add(grid);
  }
  if (scene.stage.axesVisible) runtime.content.add(new THREE.AxesHelper(2.5));

  scene.actors.forEach((track) => {
    const actor = createActor(track.id, track.color, track.label);
    actor.group.scale.setScalar(track.id === selectedActorId ? 1.08 : 1);
    runtime.content.add(actor.group);
    runtime.actors.set(track.id, actor.group);
    runtime.actorMaterials.set(track.id, actor.material);
    if (track.id === selectedActorId) addActorPath(runtime.content, scene, track.id);
  });

  scene.shots.forEach((shot) => {
    const camera = new THREE.PerspectiveCamera(shot.fov, 16 / 9, 0.1, 1000);
    camera.position.copy(vector3(shot.position));
    camera.lookAt(vector3(shot.target));
    camera.updateProjectionMatrix();
    const helper = new THREE.CameraHelper(camera);
    helper.visible = runtime.viewMode === "world";
    helper.name = `shot:${shot.id}`;
    runtime.content.add(helper);
    runtime.shotHelpers.set(shot.id, helper);
  });
};

const fitRenderer = (element: HTMLElement, runtime: Runtime) => {
  const width = Math.max(1, element.clientWidth);
  const height = Math.max(1, element.clientHeight);
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  runtime.renderer.setSize(width, height, false);
  runtime.camera.aspect = width / height;
  runtime.camera.updateProjectionMatrix();
};

export const CineworViewport = forwardRef<CineworViewportHandle, Props>(({
  scene,
  time,
  selectedActorId,
  selectedShotId,
  viewMode,
  onReady,
  onError,
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x202526, 1);
      container.appendChild(renderer.domElement);

      const world = new THREE.Scene();
      world.fog = new THREE.Fog(0x202526, 22, 54);
      const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 1000);
      camera.position.set(9, 6.5, 10);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 1.1, 0);
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minDistance = 2;
      controls.maxDistance = 42;

      const hemisphere = new THREE.HemisphereLight(0xcbd8d4, 0x32383a, 2.1);
      world.add(hemisphere);
      const key = new THREE.DirectionalLight(0xfff1da, 3.1);
      key.position.set(7, 11, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 45;
      world.add(key);
      const rim = new THREE.DirectionalLight(0x8fa9bf, 1.8);
      rim.position.set(-9, 6, -8);
      world.add(rim);
      const content = new THREE.Group();
      world.add(content);

      const runtime = {
        renderer,
        world,
        camera,
        controls,
        content,
        actors: new Map(),
        actorMaterials: new Map(),
        shotHelpers: new Map(),
        viewMode,
        selectedShotId,
        observer: undefined as unknown as ResizeObserver,
        raf: 0,
      } satisfies Runtime;
      runtimeRef.current = runtime;
      runtime.observer = new ResizeObserver(() => fitRenderer(container, runtime));
      runtime.observer.observe(container);
      fitRenderer(container, runtime);

      const render = () => {
        runtime.controls.update();
        runtime.renderer.render(runtime.world, runtime.camera);
        runtime.raf = window.requestAnimationFrame(render);
      };
      render();
      onReady?.();

      return () => {
        window.cancelAnimationFrame(runtime.raf);
        runtime.observer.disconnect();
        runtime.controls.dispose();
        disposeObject(runtime.content);
        runtime.world.clear();
        runtime.renderer.dispose();
        runtime.renderer.forceContextLoss();
        runtime.renderer.domElement.remove();
        runtimeRef.current = null;
      };
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "无法初始化 WebGL 场景");
    }
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.viewMode = viewMode;
    runtime.selectedShotId = selectedShotId;
    buildScene(runtime, scene, selectedActorId);
  }, [scene, selectedActorId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    scene.actors.forEach((track) => {
      const actor = runtime.actors.get(track.id);
      if (!actor) return;
      const state = sampleCineworActor(track, time);
      actor.position.copy(vector3(state.position));
      actor.rotation.y = THREE.MathUtils.degToRad(state.facing);
    });

    const shot = selectedShotId
      ? scene.shots.find((item) => item.id === selectedShotId)
      : scene.shots.reduce<CineworCameraShot | undefined>((selected, item) => (
        item.time <= time && (!selected || item.time >= selected.time) ? item : selected
      ), undefined);
    runtime.activeShot = shot;
    runtime.viewMode = viewMode;
    runtime.shotHelpers.forEach((helper) => { helper.visible = viewMode === "world"; });
    runtime.controls.enabled = viewMode === "world";
    if (viewMode === "shot" && shot) {
      runtime.camera.position.copy(vector3(shot.position));
      runtime.camera.fov = shot.fov;
      runtime.camera.lookAt(vector3(shot.target));
      runtime.camera.updateProjectionMatrix();
    }
  }, [scene, selectedShotId, time, viewMode]);

  useImperativeHandle(ref, () => ({
    captureCamera: () => {
      const runtime = runtimeRef.current;
      if (!runtime) return { position: [8, 5, 9], target: [0, 1.2, 0], fov: 42 };
      return {
        position: tuple(runtime.camera.position),
        target: tuple(runtime.viewMode === "shot" && runtime.activeShot
          ? vector3(runtime.activeShot.target)
          : runtime.controls.target),
        fov: runtime.camera.fov,
      };
    },
    exportFrame: (ratio) => {
      const runtime = runtimeRef.current;
      const container = containerRef.current;
      if (!runtime || !container) return null;
      const width = 1920;
      const height = ratio === "16:9" ? 1080 : 803;
      const previousRatio = runtime.renderer.getPixelRatio();
      runtime.renderer.setPixelRatio(1);
      runtime.renderer.setSize(width, height, false);
      runtime.camera.aspect = width / height;
      runtime.camera.updateProjectionMatrix();
      runtime.renderer.render(runtime.world, runtime.camera);
      const dataUrl = runtime.renderer.domElement.toDataURL("image/png");
      runtime.renderer.setPixelRatio(previousRatio);
      fitRenderer(container, runtime);
      return dataUrl;
    },
    resetView: () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.camera.position.set(9, 6.5, 10);
      runtime.camera.fov = 42;
      runtime.controls.target.set(0, 1.1, 0);
      runtime.controls.update();
      runtime.camera.updateProjectionMatrix();
    },
  }), []);

  return <div ref={containerRef} className="h-full min-h-[320px] w-full overflow-hidden bg-[#202526]" />;
});

CineworViewport.displayName = "CineworViewport";
