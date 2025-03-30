import React, { useRef, useState, Suspense, useLayoutEffect, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Canvas, useLoader, useThree, RootState } from '@react-three/fiber';
import { Center, TransformControls, OrbitControls, Grid } from '@react-three/drei'; // AxesHelper は削除
// InputAdornment を追加
import { Button, Stack, Divider, Paper, Typography, TextField, Box, ButtonGroup, Select, MenuItem, FormControl, InputLabel, SelectChangeEvent, InputAdornment } from '@mui/material';
import * as THREE from 'three';
import { STLLoader, OBJLoader } from 'three-stdlib';
import Papa from 'papaparse';
import './App.css';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { v4 as uuidv4 } from 'uuid'; // UUID生成用
import ControlPanelRight from './ControlPanelRight'; // Import the new panel

// Interfaces for CSV data (Exported)
export interface WeldPoint { id: string; process: string; x: number; y: number; z: number; gun?: string; notes?: string; }
export interface Locator { id: string; process: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; notes?: string; }
export interface Pin { id: string; process: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; notes?: string; }
export type SceneObjectData = WeldPoint | Locator | Pin;

// Type for selected object state (Exported)
export type SelectedObject = { type: 'weldPoint' | 'locator' | 'pin'; id: string } | null;

// Helper function to convert degrees to radians and vice versa
const degToRad = THREE.MathUtils.degToRad;
const radToDeg = THREE.MathUtils.radToDeg;

// --- 3D Object Components ---
// Corrected onSelect prop type for generic ObjectProps
interface ObjectComponentProps { // Renamed from ObjectProps to avoid conflict if needed elsewhere
    isSelected: boolean;
    onSelect: (mesh: THREE.Object3D) => void; // Simplified for direct use in components
}

// Adjusted specific component props
const WeldPointObject: React.FC<{ point: WeldPoint } & ObjectComponentProps> = ({ point, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'red';
  return ( <mesh ref={meshRef} name={`weldpoint-${point.id}`} userData={{ type: 'weldPoint' }} key={`wp-${point.id}`} position={[point.x, point.y, point.z]} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <sphereGeometry args={[10, 16, 16]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};
const LocatorObject: React.FC<{ locator: Locator } & ObjectComponentProps> = ({ locator, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'green'; const rotation = new THREE.Euler(degToRad(locator.rx ?? 0), degToRad(locator.ry ?? 0), degToRad(locator.rz ?? 0));
  return ( <mesh ref={meshRef} name={`locator-${locator.id}`} userData={{ type: 'locator' }} key={`loc-${locator.id}`} position={[locator.x, locator.y, locator.z]} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <boxGeometry args={[20, 8, 8]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};
const PinObject: React.FC<{ pin: Pin } & ObjectComponentProps> = ({ pin, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'blue'; const rotation = new THREE.Euler(degToRad(pin.rx ?? 0), degToRad(pin.ry ?? 0), degToRad(pin.rz ?? 0));
  return ( <mesh ref={meshRef} name={`pin-${pin.id}`} userData={{ type: 'pin' }} key={`pin-${pin.id}`} position={[pin.x, pin.y, pin.z]} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <cylinderGeometry args={[5, 5, 30, 16]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};

// Model Component - Ensure it returns JSX or null
function Model({ url, fileType }: { url: string, fileType: 'stl' | 'obj' }): JSX.Element | null {
  const loader = fileType === 'stl' ? STLLoader : OBJLoader; const geom = useLoader(loader as any, url); const ref = useRef<THREE.Object3D>(null!);
  useLayoutEffect(() => { if (!ref.current) return; ref.current.traverse((child) => { if (child instanceof THREE.Mesh) { child.userData = { type: 'modelPart' }; const applyDoubleSide = (material: THREE.Material | THREE.Material[]) => { if (Array.isArray(material)) material.forEach(m => m.side = THREE.DoubleSide); else material.side = THREE.DoubleSide; }; if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: 'gray', side: THREE.DoubleSide }); else applyDoubleSide(child.material); } }); const box = new THREE.Box3().setFromObject(ref.current); const center = box.getCenter(new THREE.Vector3()); ref.current.position.sub(center); }, [geom]);
  if (fileType === 'obj' && geom instanceof THREE.Group) return <primitive name="loaded-model-obj" ref={ref as React.MutableRefObject<THREE.Group>} object={geom} scale={1} />;
  if (fileType === 'stl' && geom instanceof THREE.BufferGeometry) return <mesh name="loaded-model-stl" ref={ref as React.MutableRefObject<THREE.Mesh>} geometry={geom} scale={1}><meshStandardMaterial color="lightblue" side={THREE.DoubleSide} /></mesh>;
  return null;
}

// Function to trigger CSV download
const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) { alert(`No data to export for ${filename}`); return; } const csv = Papa.unparse(data); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); const url = URL.createObjectURL(blob); link.setAttribute('href', url); link.setAttribute('download', filename); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
};

// --- Properties Panel Component ---
interface PropertiesPanelProps {
  selectedObjectData: SceneObjectData | null;
  onUpdate: (updatedData: Partial<SceneObjectData>) => void;
  // Add all data lists for ID uniqueness check
  allWeldPoints: WeldPoint[];
  allLocators: Locator[];
  allPins: Pin[];
}
type AllKeys = keyof WeldPoint | keyof Locator | keyof Pin;
const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedObjectData,
  onUpdate,
  allWeldPoints,
  allLocators,
  allPins
}): JSX.Element | null => {
  const [editData, setEditData] = useState<Partial<WeldPoint & Locator & Pin>>({});
  useEffect(() => { setEditData(selectedObjectData ?? {}); }, [selectedObjectData]);
  if (!selectedObjectData) return null;

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    // For numeric fields, parse to number, otherwise keep as string. Handle empty string specifically.
    const parsedValue = (name === 'x' || name === 'y' || name === 'z' || name === 'rx' || name === 'ry' || name === 'rz')
      ? (value === '' ? '' : (isNaN(Number(value)) ? value : Number(value))) // Keep invalid number as string for temp state
      : value; // Keep ID, process, notes, gun as string
    setEditData(prev => ({ ...prev, [name]: parsedValue }));
  };

  const handleBlur = (fieldName: AllKeys) => {
    const currentData = selectedObjectData as any; // Original data of the selected object
    const editDataTyped = editData as any;       // Current state of the input fields
    const currentValue = currentData[fieldName]; // Original value of the blurred field
    const editedValue = editDataTyped[fieldName]; // Value currently in the input field

    // If the value hasn't actually changed, do nothing
    if (editedValue === currentValue) {
        console.log(`Blur on ${fieldName}, value unchanged.`);
        return;
    }

    // --- ID Validation ---
    if (fieldName === 'id') {
        const newId = String(editedValue).trim(); // Ensure it's a string and trim whitespace
        if (newId === '') {
            alert("ID cannot be empty.");
            setEditData(prev => ({ ...prev, id: currentValue })); // Revert to original ID
            return;
        }
        // Check for uniqueness across all items EXCEPT the current one
        const isDuplicate = [
            ...allWeldPoints.filter(item => item.id !== currentData.id),
            ...allLocators.filter(item => item.id !== currentData.id),
            ...allPins.filter(item => item.id !== currentData.id)
        ].some(item => item.id === newId);

        if (isDuplicate) {
            alert(`ID "${newId}" already exists. Please choose a unique ID.`);
            setEditData(prev => ({ ...prev, id: currentValue })); // Revert
            return;
        }
        // If valid and unique, proceed to update
        onUpdate({ id: newId });
        return; // ID update handled, exit function
    }

    // --- Numeric Field Validation ---
    if (['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(fieldName as string)) {
        if (editedValue === '' || typeof editedValue !== 'number' || isNaN(editedValue)) {
             console.warn(`Invalid number input for ${fieldName}: "${editedValue}". Reverting.`);
             alert(`Invalid number for ${fieldName}. Please enter a valid number.`);
             setEditData(prev => ({ ...prev, [fieldName]: currentValue })); // Revert
             return;
        }
         // If valid number, proceed to update
         onUpdate({ [fieldName]: editedValue } as Partial<SceneObjectData>);
         return; // Numeric update handled
    }

    // --- Other Fields (process, notes, gun) ---
    // Allow empty strings for these fields if needed
    if (editedValue !== undefined) { // Check if it was actually edited (could be null/undefined initially)
        onUpdate({ [fieldName]: editedValue } as Partial<SceneObjectData>);
    } else if (editedValue === '' && currentValue !== '') {
        // If user cleared a field that previously had value, update it to empty string
         onUpdate({ [fieldName]: '' } as Partial<SceneObjectData>);
    }
    // No action needed if editedValue is undefined and currentValue was also undefined/null
  };

  const formatForDisplay = (value: string | number | undefined): string => { if (value === undefined || value === null) return ''; if (typeof value === 'number') return value.toFixed(3); return String(value); };
  return (
    <Paper elevation={3} sx={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1, p: 2, minWidth: 250, maxWidth: 300, maxHeight: '40vh', overflowY: 'auto', background: 'rgba(40,40,40,0.8)', color: 'white' }}>
      <Typography variant="h6" gutterBottom>Properties</Typography>
      <Box component="form" noValidate autoComplete="off">
        {/* Removed readOnly from ID field */}
        <TextField label="ID" name="id" value={editData.id ?? ''} onChange={handleInputChange} onBlur={() => handleBlur('id')} margin="dense" size="small" fullWidth InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="Process" name="process" value={editData.process ?? ''} onChange={handleInputChange} onBlur={() => handleBlur('process')} margin="dense" size="small" fullWidth InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="X" name="x" value={formatForDisplay(editData.x)} onChange={handleInputChange} onBlur={() => handleBlur('x')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="Y" name="y" value={formatForDisplay(editData.y)} onChange={handleInputChange} onBlur={() => handleBlur('y')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="Z" name="z" value={formatForDisplay(editData.z)} onChange={handleInputChange} onBlur={() => handleBlur('z')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        {(selectedObjectData && ('rx' in selectedObjectData || 'ry' in selectedObjectData || 'rz' in selectedObjectData)) && (
          <>
            <TextField label="Rot X (deg)" name="rx" value={formatForDisplay(editData.rx)} onChange={handleInputChange} onBlur={() => handleBlur('rx')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
            <TextField label="Rot Y (deg)" name="ry" value={formatForDisplay(editData.ry)} onChange={handleInputChange} onBlur={() => handleBlur('ry')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
            <TextField label="Rot Z (deg)" name="rz" value={formatForDisplay(editData.rz)} onChange={handleInputChange} onBlur={() => handleBlur('rz')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
          </>
        )}
         {(selectedObjectData && 'gun' in selectedObjectData) && (
             <TextField label="Gun" name="gun" value={editData.gun ?? ''} onChange={handleInputChange} onBlur={() => handleBlur('gun')} margin="dense" size="small" fullWidth InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
         )}
        <TextField label="Notes" name="notes" value={editData.notes ?? ''} onChange={handleInputChange} onBlur={() => handleBlur('notes')} margin="dense" size="small" fullWidth multiline rows={2} InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ textarea: { color: 'white !important' }, label: { color: 'lightgray' } }} />
      </Box>
    </Paper>
  );
};

// --- SceneContent Ref Type ---
export interface SceneContentHandles {
  setView: (direction: 'x' | 'y' | 'z' | 'xyz') => void;
}

// --- Main App Component Wrapper ---
function App() {
  // Data states
  const [weldPoints, setWeldPoints] = useState<WeldPoint[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [modelData, setModelData] = useState<{ url: string; fileType: 'stl' | 'obj' } | null>(null);
  // Filter states
  const [selectedProcess, setSelectedProcess] = useState<string>('ALL');
  const [availableProcesses, setAvailableProcesses] = useState<string[]>(['ALL']);
  // Selection states
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [selectedMesh, setSelectedMesh] = useState<THREE.Object3D | null>(null);
  const [selectedObjectData, setSelectedObjectData] = useState<SceneObjectData | null>(null);
  // Camera Clipping State
  const [nearClip, setNearClip] = useState<number>(0.1);
  const [farClip, setFarClip] = useState<number>(10000);
  // Visibility states
  const [showModel, setShowModel] = useState<boolean>(true);
  const [showWeldPoints, setShowWeldPoints] = useState<boolean>(true);
  const [showLocators, setShowLocators] = useState<boolean>(true);
  const [showPins, setShowPins] = useState<boolean>(true);


  // Refs
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const weldPointFileInputRef = useRef<HTMLInputElement>(null);
  const locatorFileInputRef = useRef<HTMLInputElement>(null);
  const pinFileInputRef = useRef<HTMLInputElement>(null);
  const sceneContentRef = useRef<SceneContentHandles>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl>(null!);
  const transformControlsRef = useRef<any>(null!);


  // --- CSV File Handler ---
  const handleCsvFileChange = ( event: React.ChangeEvent<HTMLInputElement>, dataType: 'Weld Point' | 'Locator' | 'Pin' ) => {
    const file = event.target.files?.[0]; if (!file) return; console.log(`Loading ${dataType} CSV:`, file.name);
    Papa.parse(file, { header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: (results) => {
        console.log(`${dataType} Data Loaded:`, results.data);
        if (results.data.length > 0) {
            const firstRow = results.data[0] as any;
            if (!firstRow.id || firstRow.x === undefined || firstRow.y === undefined || firstRow.z === undefined) {
                alert(`Invalid ${dataType} CSV format. Missing required columns (id, x, y, z).`);
                console.error(`Invalid ${dataType} CSV format.`, firstRow);
                event.target.value = ''; return;
            }
        }
        const loadedData = results.data as any[];
        event.target.value = '';

        // Update the correct state based on dataType
        if (dataType === 'Weld Point') setWeldPoints(loadedData);
        else if (dataType === 'Locator') setLocators(loadedData);
        else if (dataType === 'Pin') setPins(loadedData);
        // Note: Process list update is now handled by useEffect below
      },
      error: (error) => { alert(`Error parsing ${dataType} CSV: ${error.message}`); console.error(`Error parsing ${dataType} CSV:`, error); event.target.value = ''; },
    });
  };

  // --- Effect to Update Available Processes ---
  useEffect(() => {
    const allProcesses = [
        ...weldPoints.map(item => item.process),
        ...locators.map(item => item.process),
        ...pins.map(item => item.process),
    ];
    const uniqueProcesses = [...new Set(allProcesses.filter(Boolean))] as string[];
    const newAvailableProcesses = ['ALL', ...uniqueProcesses.sort()];

    setAvailableProcesses(currentAvailable => {
        if (JSON.stringify(newAvailableProcesses) !== JSON.stringify(currentAvailable)) {
             if (!newAvailableProcesses.includes(selectedProcess)) {
                setSelectedProcess('ALL');
             }
            return newAvailableProcesses;
        }
        return currentAvailable;
    });
  }, [weldPoints, locators, pins, selectedProcess]); // Depend on all data lists


  // --- Model File Handler ---
  const handleModelFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const fileType = file.name.split('.').pop()?.toLowerCase();
    if (fileType !== 'stl' && fileType !== 'obj') { alert('Unsupported file type. Please load STL or OBJ files.'); event.target.value = ''; return; }
    const url = URL.createObjectURL(file); console.log(`Loading ${fileType.toUpperCase()} Model:`, file.name); setModelData({ url, fileType }); event.target.value = '';
  };

  const handleLoadClick = (ref: React.RefObject<HTMLInputElement>) => ref.current?.click();
  useLayoutEffect(() => { return () => { if (modelData?.url) { URL.revokeObjectURL(modelData.url); console.log("Revoked Model Object URL:", modelData.url); } }; }, [modelData]);

  // --- Camera View Handler ---
  const handleSetView = (direction: 'x' | 'y' | 'z' | 'xyz') => { sceneContentRef.current?.setView(direction); };

  // --- Process Filter Handler ---
  const handleProcessChange = (event: SelectChangeEvent<string>) => { setSelectedProcess(event.target.value); };

  // --- Selection Handlers --- (Updated handleSelect signature)
  const handleSelect = useCallback((type: 'weldPoint' | 'locator' | 'pin', id: string, mesh: THREE.Object3D | null) => {
    // If mesh is null (selected from list), try to find it in the scene
    // This part might need refinement depending on how meshes are managed/accessed
    let foundMesh = mesh;
    if (!foundMesh) {
        // Attempt to find the mesh by name in the scene
        // NOTE: This requires access to the scene object, which isn't directly available here.
        // This logic might need to live within SceneContent or be handled differently.
        // For now, we proceed assuming mesh might be null if not found immediately.
        console.warn(`Mesh not provided for ${type} ${id}. Attempting selection without mesh focus.`);
        // Example: const scene = sceneContentRef.current?.getSceneObject(); // Hypothetical function
        // if (scene) foundMesh = scene.getObjectByName(`${type}-${id}`);
    }

    setSelectedObject({ type, id });
    setSelectedMesh(foundMesh); // Can be null if not found/provided

    let data: SceneObjectData | undefined;
    if (type === 'weldPoint') data = weldPoints.find(p => p.id === id);
    else if (type === 'locator') data = locators.find(l => l.id === id);
    else if (type === 'pin') data = pins.find(p => p.id === id);
    setSelectedObjectData(data ?? null);

    // Only focus camera if mesh is found
    if (foundMesh && orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(foundMesh.position);
        orbitControlsRef.current.update();
    } else if (!foundMesh) {
        // Optionally reset camera target if mesh isn't found? Or leave as is.
        // orbitControlsRef.current?.target.set(0, 0, 0);
        // orbitControlsRef.current?.update();
    }
  }, [weldPoints, locators, pins]);


  const handleDeselect = useCallback(() => {
    if (!transformControlsRef.current?.dragging) {
        setSelectedObject(null); setSelectedMesh(null); setSelectedObjectData(null);
        if (orbitControlsRef.current) { orbitControlsRef.current.target.set(0, 0, 0); orbitControlsRef.current.update(); }
    }
  }, []);

  // --- Data Update Handlers ---
  const updateObjectData = useCallback((id: string, type: 'weldPoint' | 'locator' | 'pin', updates: Partial<WeldPoint | Locator | Pin>) => {
    console.log(`Updating ${type} ${id} from ${Object.keys(updates).join(', ')}:`, updates);
    let foundItem: SceneObjectData | null = null;
    const updateState = (setter: React.Dispatch<React.SetStateAction<any[]>>) => { setter(prev => prev.map(item => { if (item.id === id) { foundItem = { ...item, ...updates }; return foundItem; } return item; })); };
    switch (type) { case 'weldPoint': updateState(setWeldPoints); break; case 'locator': updateState(setLocators); break; case 'pin': updateState(setPins); break; }
    if (selectedObject?.id === id && foundItem) { setSelectedObjectData(foundItem); }
    if (selectedMesh && selectedObject?.id === id) {
        const updatesAny = updates as any;
        if (updatesAny.x !== undefined) selectedMesh.position.x = updatesAny.x;
        if (updatesAny.y !== undefined) selectedMesh.position.y = updatesAny.y;
        if (updatesAny.z !== undefined) selectedMesh.position.z = updatesAny.z;
        if (type !== 'weldPoint') {
            const currentRotation = selectedMesh.rotation.clone();
            if (updatesAny.rx !== undefined) currentRotation.x = degToRad(updatesAny.rx);
            if (updatesAny.ry !== undefined) currentRotation.y = degToRad(updatesAny.ry);
            if (updatesAny.rz !== undefined) currentRotation.z = degToRad(updatesAny.rz);
            if (!currentRotation.equals(selectedMesh.rotation)) { selectedMesh.rotation.copy(currentRotation); }
        }
     }
  }, [selectedObject, selectedMesh, setWeldPoints, setLocators, setPins]);

  const handlePropertyUpdate = useCallback((updates: Partial<SceneObjectData>) => {
      if (selectedObject) { updateObjectData(selectedObject.id, selectedObject.type, updates as Partial<WeldPoint | Locator | Pin>); }
  }, [selectedObject, updateObjectData]);

  const handleTransformEnd = useCallback(() => {
    if (!selectedObject || !selectedMesh) return;
    const { position, rotation } = selectedMesh; const { type, id } = selectedObject;
    let updates: Partial<WeldPoint | Locator | Pin> = { x: position.x, y: position.y, z: position.z };
    if (type !== 'weldPoint') { updates = { ...updates, rx: radToDeg(rotation.x), ry: radToDeg(rotation.y), rz: radToDeg(rotation.z) }; }
    updateObjectData(id, type, updates);
  }, [selectedObject, selectedMesh, updateObjectData]);

  // --- Add/Delete Handlers ---
  const getCameraLookAtPoint = (distance = 100): THREE.Vector3 => {
      const camera = orbitControlsRef.current?.object;
      if (!camera) return new THREE.Vector3(0, 0, 0); // Fallback
      const lookAtVector = new THREE.Vector3(0, 0, -1);
      lookAtVector.applyQuaternion(camera.quaternion);
      lookAtVector.multiplyScalar(distance);
      const targetPoint = camera.position.clone().add(lookAtVector);
      return targetPoint;
  };

  const addElement = (type: 'weldPoint' | 'locator' | 'pin') => {
      const newId = uuidv4();
      const position = getCameraLookAtPoint(100); // Add slightly in front of camera view
      const commonProps = { id: newId, process: 'NEW', x: position.x, y: position.y, z: position.z, notes: '' };
      let newItem: WeldPoint | Locator | Pin;

      if (type === 'weldPoint') {
          newItem = { ...commonProps, gun: 'DefaultGun' };
          setWeldPoints(prev => [...prev, newItem]);
      } else { // Locator or Pin
          const rotationProps = { rx: 0, ry: 0, rz: 0 };
          newItem = { ...commonProps, ...rotationProps };
          if (type === 'locator') {
              setLocators(prev => [...prev, newItem as Locator]);
          } else { // Pin
              setPins(prev => [...prev, newItem as Pin]);
          }
      }
      console.log(`Added new ${type}:`, newItem);
      // Optionally select the newly added item immediately
      // setTimeout(() => {
      //     const newMesh = scene.getObjectByName(`${type}-${newId}`); // Need access to scene or a way to find the mesh
      //     if (newMesh) handleSelect(type, newId, newMesh);
      // }, 100); // Delay to allow mesh creation
  };

  const deleteSelectedElement = () => {
      if (!selectedObject) {
          alert("No object selected to delete.");
          return;
      }
      const { type, id } = selectedObject;
      const confirmation = window.confirm(`Are you sure you want to delete ${type} ${id}?`);
      if (!confirmation) return;

      if (type === 'weldPoint') setWeldPoints(prev => prev.filter(item => item.id !== id));
      else if (type === 'locator') setLocators(prev => prev.filter(item => item.id !== id));
      else if (type === 'pin') setPins(prev => prev.filter(item => item.id !== id));

      console.log(`Deleted ${type} ${id}`);
      handleDeselect(); // Deselect after deletion
  };


  // --- Filtered Data ---
  const filteredWeldPoints = useMemo<WeldPoint[]>(() => {
    if (selectedProcess === 'ALL') return weldPoints;
    return weldPoints.filter(wp => wp.process === selectedProcess);
  }, [weldPoints, selectedProcess]);

  const filteredLocators = useMemo<Locator[]>(() => {
    if (selectedProcess === 'ALL') return locators;
    return locators.filter(lt => lt.process === selectedProcess);
  }, [locators, selectedProcess]);

  const filteredPins = useMemo<Pin[]>(() => {
     if (selectedProcess === 'ALL') return pins;
     return pins.filter(pin => pin.process === selectedProcess);
  }, [pins, selectedProcess]);

  // --- Camera Clip Handlers ---
  const handleNearClipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    if (!isNaN(value) && value > 0) { setNearClip(value); }
  };
  const handleFarClipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    if (!isNaN(value) && value > nearClip) { setFarClip(value); }
     else if (!isNaN(value) && value <= nearClip) {
        console.warn("Far clip must be greater than near clip.");
    }
  };


  return (
    <div className="App">
      {/* --- Control Panel --- */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, background: 'rgba(40,40,40,0.8)', padding: '10px', borderRadius: '5px', color: 'white', maxHeight: '95vh', overflowY: 'auto' }}>
        <Stack direction="column" spacing={1}>
            <input type="file" ref={modelFileInputRef} onChange={handleModelFileChange} style={{ display: 'none' }} accept=".stl,.obj" />
            <input type="file" ref={weldPointFileInputRef} onChange={(e) => handleCsvFileChange(e, 'Weld Point')} style={{ display: 'none' }} accept=".csv" />
            <input type="file" ref={locatorFileInputRef} onChange={(e) => handleCsvFileChange(e, 'Locator')} style={{ display: 'none' }} accept=".csv" />
            <input type="file" ref={pinFileInputRef} onChange={(e) => handleCsvFileChange(e, 'Pin')} style={{ display: 'none' }} accept=".csv" />
            <Button size="small" variant="contained" onClick={() => handleLoadClick(modelFileInputRef)}>Load Model</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(weldPointFileInputRef)}>Load Weld Points</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(locatorFileInputRef)}>Load Locators</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(pinFileInputRef)}>Load Pins</Button>
            <Divider />
             <FormControl size="small" sx={{ m: 1, minWidth: 120, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' }, '& .MuiSvgIcon-root': { color: 'white' }, '& .MuiInputLabel-root': { color: 'lightgray' }, '& .MuiSelect-select': { color: 'white' } }}>
              <InputLabel id="process-select-label">Filter Process</InputLabel>
              <Select labelId="process-select-label" id="process-select" value={selectedProcess} label="Filter Process" onChange={handleProcessChange} >
                {availableProcesses.map(proc => (<MenuItem key={proc} value={proc}>{proc}</MenuItem>))}
              </Select>
            </FormControl>
            <Divider />
            <Button size="small" variant="outlined" onClick={() => downloadCSV(filteredWeldPoints, 'weld_points_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Filtered WP</Button>
            <Button size="small" variant="outlined" onClick={() => downloadCSV(filteredLocators, 'locators_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Filtered LT</Button>
            <Button size="small" variant="outlined" onClick={() => downloadCSV(filteredPins, 'pins_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Filtered Pins</Button>
            <Divider />
             <Typography variant="caption" sx={{ color: 'lightgray', mb: 0.5 }}>Camera Views</Typography>
             <ButtonGroup variant="outlined" size="small" aria-label="camera view controls">
                <Button onClick={() => handleSetView('x')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>X</Button>
                <Button onClick={() => handleSetView('y')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Y</Button>
                <Button onClick={() => handleSetView('z')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Z</Button>
                <Button onClick={() => handleSetView('xyz')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>XYZ</Button>
             </ButtonGroup>
             <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.5)' }} />
             <Typography variant="caption" sx={{ color: 'lightgray', mb: 0.5 }}>Camera Clipping</Typography>
             <TextField label="Near Plane" type="number" size="small" value={nearClip} onChange={handleNearClipChange} InputProps={{ style: { color: 'white' }, inputProps: { min: 0.01, step: 0.1 }, startAdornment: <InputAdornment position="start" sx={{color: 'lightgray'}}>N:</InputAdornment>, }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' }, mb: 1 }} />
             <TextField label="Far Plane" type="number" size="small" value={farClip} onChange={handleFarClipChange} InputProps={{ style: { color: 'white' }, inputProps: { min: nearClip + 0.1, step: 100 }, startAdornment: <InputAdornment position="start" sx={{color: 'lightgray'}}>F:</InputAdornment>, }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        </Stack>
      </div>

      <PropertiesPanel
           selectedObjectData={selectedObjectData}
           onUpdate={handlePropertyUpdate}
           allWeldPoints={weldPoints} // Pass full list
           allLocators={locators}     // Pass full list
           allPins={pins}           // Pass full list
       />

     {/* Canvas Container - Adjusted width for right panel */}
      <div style={{ height: '100vh', width: '100vw', position: 'relative', paddingRight: '290px', boxSizing: 'border-box' }}>
        {/* --- 修正: Canvas の camera prop から near/far を削除 --- */}
        <Canvas camera={{ position: [0, 50, 150], fov: 50 }}>
          <SceneContent
            ref={sceneContentRef}
            modelData={modelData}
            weldPoints={filteredWeldPoints}
            locators={filteredLocators}
            pins={filteredPins}
            selectedObject={selectedObject}
            selectedMesh={selectedMesh}
            handleSelect={handleSelect}
            handleDeselect={handleDeselect}
            handleTransformEnd={handleTransformEnd}
            orbitControlsRef={orbitControlsRef}
            transformControlsRef={transformControlsRef}
            // --- 追加: nearClip と farClip を props として渡す ---
            nearClip={nearClip} // Removed duplicate nearClip
            farClip={farClip}
            // Pass visibility states
            showModel={showModel}
            showWeldPoints={showWeldPoints}
            showLocators={showLocators}
            showPins={showPins}
          />
        </Canvas>
      </div>

      {/* --- Right Control Panel --- */}
      <ControlPanelRight
        showModel={showModel} setShowModel={setShowModel}
        showWeldPoints={showWeldPoints} setShowWeldPoints={setShowWeldPoints}
        showLocators={showLocators} setShowLocators={setShowLocators}
        showPins={showPins} setShowPins={setShowPins}
        weldPoints={weldPoints} // Pass all weld points for the list
        locators={locators}     // Pass all locators for the list
        pins={pins}           // Pass all pins for the list
        selectedObject={selectedObject}
        handleSelect={handleSelect} // Pass down selection handler
        addElement={addElement}
        deleteSelectedElement={deleteSelectedElement}
      />
    </div>
  );
}

export default App;

// --- SceneContent Component ---
interface SceneContentProps {
  modelData: { url: string; fileType: 'stl' | 'obj' } | null;
  weldPoints: WeldPoint[];
  locators: Locator[];
  pins: Pin[];
  selectedObject: SelectedObject;
  selectedMesh: THREE.Object3D | null;
  handleSelect: (type: 'weldPoint' | 'locator' | 'pin', id: string, mesh: THREE.Object3D) => void;
  handleDeselect: () => void;
  handleTransformEnd: () => void;
  orbitControlsRef: React.RefObject<OrbitControlsImpl>;
  transformControlsRef: React.RefObject<any>;
  // --- 追加: nearClip と farClip を props で受け取る ---
  nearClip: number;
  farClip: number;
  // --- 追加: Visibility states ---
  showModel: boolean;
  showWeldPoints: boolean;
  showLocators: boolean;
  showPins: boolean;
}

const SceneContent = forwardRef<SceneContentHandles, SceneContentProps>(({
  modelData,
  weldPoints,
  locators,
  pins,
  selectedObject,
  selectedMesh,
  handleSelect,
  handleDeselect,
  handleTransformEnd,
  orbitControlsRef,
  transformControlsRef,
  // --- 追加: props から nearClip と farClip を受け取る ---
  nearClip,
  farClip,
  // --- 追加: Visibility states ---
  showModel,
  showWeldPoints,
  showLocators,
  showPins
}, ref): JSX.Element => { // Added return type

  const { camera, scene, controls } = useThree((state: RootState) => ({
      camera: state.camera as THREE.PerspectiveCamera,
      scene: state.scene,
      controls: state.controls as OrbitControlsImpl | null
  }));

  // --- 追加: useEffect で near/far の変更をカメラに適用 ---
  useEffect(() => {
    if (camera) {
      camera.near = nearClip;
      camera.far = farClip;
      camera.updateProjectionMatrix(); // 変更を適用するために必要
      console.log(`Camera clip planes updated: near=${camera.near}, far=${camera.far}`);
    }
  }, [camera, nearClip, farClip]); // camera, nearClip, farClip が変更されたら実行

  // Expose setView method via ref
  useImperativeHandle(ref, () => ({
    setView: (direction: 'x' | 'y' | 'z' | 'xyz') => {
      if (!controls || !(controls instanceof OrbitControlsImpl) || !camera) return;
      const box = new THREE.Box3(); let objectsFound = false;
      const objectsToFrame: THREE.Object3D[] = [];
      if (modelData) { const modelObject = scene.getObjectByName('loaded-model-obj') || scene.getObjectByName('loaded-model-stl'); if (modelObject) { objectsToFrame.push(modelObject); } }
      weldPoints.forEach(point => { const wpObject = scene.getObjectByName(`weldpoint-${point.id}`); if (wpObject) { objectsToFrame.push(wpObject); } });
      locators.forEach(loc => { const locObject = scene.getObjectByName(`locator-${loc.id}`); if (locObject) { objectsToFrame.push(locObject); } });
      pins.forEach(pin => { const pinObject = scene.getObjectByName(`pin-${pin.id}`); if (pinObject) { objectsToFrame.push(pinObject); } });

      if (objectsToFrame.length > 0) { objectsToFrame.forEach(object => { object.updateMatrixWorld(); const objectBox = new THREE.Box3().setFromObject(object, true); if (!objectBox.isEmpty()) { if (!objectsFound) { box.copy(objectBox); objectsFound = true; } else { box.union(objectBox); } } }); }
      if (!objectsFound || box.isEmpty()) { console.warn("No visible objects found or bounding box is empty, cannot set view."); controls.target.set(0, 0, 0); camera.position.set(0, 50, 150); controls.update(); return; }
      const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z); const fov = camera.fov * (Math.PI / 180); let cameraZ = Math.abs(maxDim / 1.5 / Math.tan(fov / 2)); cameraZ *= 1.2;
      controls.target.copy(center);
      const offset = cameraZ > 0 ? cameraZ : 10;
      camera.up.set(0, 1, 0);
      switch (direction) {
        case 'x': camera.position.set(center.x + offset, center.y, center.z); break;
        case 'y': camera.position.set(center.x, center.y + offset, center.z + 0.01); camera.up.set(0, 0, -1); break;
        case 'z': camera.position.set(center.x, center.y, center.z + offset); break;
        case 'xyz': default: const diagOffset = offset * 0.707; camera.position.set(center.x + diagOffset, center.y + diagOffset, center.z + diagOffset); break;
      }
      console.log(`Direction: ${direction}, Camera Up Before LookAt:`, camera.up.toArray());
      camera.lookAt(center);
      if (direction === 'y') { camera.up.set(0, 0, -1); } else { camera.up.set(0, 1, 0); }
      controls.update();
      console.log(`Set view to ${direction}. Center:`, center, "Size:", size, "Cam Pos:", camera.position);
    }
  }));

  // Effect to disable OrbitControls while dragging TransformControls
  useEffect(() => {
      const transform = transformControlsRef.current;
      const orbit = orbitControlsRef.current;
      if (!transform || !orbit) return;
      // Correct event type for drei's TransformControls
      const callback = (event: { value: boolean }) => { orbit.enabled = !event.value; };
      transform.addEventListener('dragging-changed', callback);
      return () => transform.removeEventListener('dragging-changed', callback);
  }, [orbitControlsRef, transformControlsRef]);

  // Internal handler to call the lifted handleSelect with type information
  const onObjectSelect = (type: 'weldPoint' | 'locator' | 'pin', id: string) => (mesh: THREE.Object3D) => {
      handleSelect(type, id, mesh);
  };


  return ( // Ensure return statement is present
    <>
      <mesh scale={1000} onClick={handleDeselect} > <planeGeometry /> <meshBasicMaterial visible={false} /> </mesh>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />
      <axesHelper args={[50]} />
      <Suspense fallback={null}>
        {/* Model Visibility */}
        {showModel && modelData && ( <Center> <Model url={modelData.url} fileType={modelData.fileType} /> </Center> )}
        {/* Keep placeholder if no model and model visibility is on, or always show placeholder? Let's show if no model loaded, regardless of toggle */}
        {!modelData && ( <mesh> <boxGeometry args={[1, 1, 1]} /> <meshStandardMaterial color="orange" /> </mesh> )}

        {/* Weld Points Visibility */}
        {showWeldPoints && weldPoints.map((point) => ( <WeldPointObject key={`wp-${point.id}`} point={point} isSelected={selectedObject?.type === 'weldPoint' && selectedObject.id === point.id} onSelect={onObjectSelect('weldPoint', point.id)} /> ))}

        {/* Locators Visibility */}
        {showLocators && locators.map((loc) => ( <LocatorObject key={`loc-${loc.id}`} locator={loc} isSelected={selectedObject?.type === 'locator' && selectedObject.id === loc.id} onSelect={onObjectSelect('locator', loc.id)} /> ))}

        {/* Pins Visibility */}
        {showPins && pins.map((pin) => ( <PinObject key={`pin-${pin.id}`} pin={pin} isSelected={selectedObject?.type === 'pin' && selectedObject.id === pin.id} onSelect={onObjectSelect('pin', pin.id)} /> ))}

        {/* TransformControls Visibility: Show only if the selected object's type is also visible */}
        {selectedMesh &&
         ((selectedObject?.type === 'weldPoint' && showWeldPoints) ||
          (selectedObject?.type === 'locator' && showLocators) ||
          (selectedObject?.type === 'pin' && showPins)) && (
          <TransformControls ref={transformControlsRef} object={selectedMesh} mode={selectedObject?.type === 'weldPoint' ? 'translate' : 'translate'} onMouseUp={handleTransformEnd} size={0.5} />
        )}
      </Suspense>
      <OrbitControls makeDefault ref={orbitControlsRef} />
      <Grid infiniteGrid rotation={[Math.PI / 2, 0, 0]} cellSize={100} sectionSize={1000} sectionColor={"lightblue"} fadeDistance={5000} />
    </>
  );
});