import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function Avatar3D({ faceUrl, gender = 'woman', shirtColor = '#3b82f6', pantsColor = '#1f2937' }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const avatarGroupRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f0eb);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2.5;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Avatar Group
    const avatarGroup = new THREE.Group();
    scene.add(avatarGroup);
    avatarGroupRef.current = avatarGroup;

    // Helper: Create rounded box geometry
    const createRoundedBox = (width, height, depth, radius) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const positionAttribute = geometry.getAttribute('position');
      const vertex = new THREE.Vector3();
      for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);
        vertex.x = Math.sign(vertex.x) * (Math.abs(vertex.x) - radius);
        vertex.y = Math.sign(vertex.y) * (Math.abs(vertex.y) - radius);
        vertex.z = Math.sign(vertex.z) * (Math.abs(vertex.z) - radius);
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      geometry.computeVertexNormals();
      return geometry;
    };

    // Feet/Shoes
    const footGeometry = new THREE.SphereGeometry(0.12, 16, 16);
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const leftFoot = new THREE.Mesh(footGeometry, shoeMaterial);
    leftFoot.position.set(-0.25, -1.55, 0);
    leftFoot.scale.set(1, 0.7, 1);
    leftFoot.castShadow = true;
    avatarGroup.add(leftFoot);
    const rightFoot = new THREE.Mesh(footGeometry, shoeMaterial);
    rightFoot.position.set(0.25, -1.55, 0);
    rightFoot.scale.set(1, 0.7, 1);
    rightFoot.castShadow = true;
    avatarGroup.add(rightFoot);

    // Legs/Pants - דק יותר
    const pantsColor3 = new THREE.Color(pantsColor);
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: pantsColor3 });
    const legsGeometry = new THREE.BoxGeometry(0.45, 0.85, 0.35);
    const legs = new THREE.Mesh(legsGeometry, pantsMaterial);
    legs.position.set(0, -0.45, 0);
    legs.castShadow = true;
    avatarGroup.add(legs);

    // Torso/Shirt - גוף קטן יותר
    const shirtColor3 = new THREE.Color(shirtColor);
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: shirtColor3 });
    const torsoGeometry = new THREE.BoxGeometry(0.5, 0.75, 0.4);
    const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
    torso.position.set(0, 0.25, 0);
    torso.castShadow = true;
    avatarGroup.add(torso);

    // Neck
    const neckGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.15, 16);
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd4a574 });
    const neck = new THREE.Mesh(neckGeometry, skinMaterial);
    neck.position.set(0, 0.85, 0);
    neck.castShadow = true;
    avatarGroup.add(neck);

    // Arms - דקים וקטנים יותר
    const armGeometry = new THREE.CapsuleGeometry(0.11, 0.65, 4, 8);
    const leftArm = new THREE.Mesh(armGeometry, shirtMaterial);
    leftArm.position.set(-0.35, 0.25, 0);
    leftArm.rotation.z = 0.2;
    leftArm.castShadow = true;
    avatarGroup.add(leftArm);
    const rightArm = new THREE.Mesh(armGeometry, shirtMaterial);
    rightArm.position.set(0.35, 0.25, 0);
    rightArm.rotation.z = -0.2;
    rightArm.castShadow = true;
    avatarGroup.add(rightArm);

    // Hands
    const handGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
    leftHand.position.set(-0.4, -0.2, 0);
    leftHand.castShadow = true;
    avatarGroup.add(leftHand);
    const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
    rightHand.position.set(0.4, -0.2, 0);
    rightHand.castShadow = true;
    avatarGroup.add(rightHand);

    // Head - קטן יותר
    const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xd4a574 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.3, 0);
    head.castShadow = true;
    avatarGroup.add(head);

    // Face Texture (if provided)
    if (faceUrl) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(faceUrl, (texture) => {
        const canvasMaterial = new THREE.CanvasTexture(
          createFaceCanvas(texture, gender)
        );
        const faceGeometry = new THREE.SphereGeometry(0.34, 32, 32);
        const faceMesh = new THREE.Mesh(faceGeometry, new THREE.MeshStandardMaterial({ map: canvasMaterial }));
        faceMesh.position.copy(head.position);
        faceMesh.position.z += 0.05;
        faceMesh.castShadow = true;
        avatarGroup.add(faceMesh);
      });
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      avatarGroup.rotation.y += 0.005;
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [faceUrl, gender, shirtColor, pantsColor]);

  return <div ref={containerRef} style={{ width: '100%', height: '400px', borderRadius: '12px', overflow: 'hidden' }} />;
}

// Helper function to create face canvas texture
function createFaceCanvas(texture, gender) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Draw face
  ctx.fillStyle = '#d4a574';
  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, Math.PI * 2);
  ctx.fill();

  // Draw face image
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 100, 100, 312, 312);
  };
  img.src = texture.source.data.src || '';

  // Simple eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(210, 220, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(310, 220, 15, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}