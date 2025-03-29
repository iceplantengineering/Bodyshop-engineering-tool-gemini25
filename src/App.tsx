import React, { useRef, useState, Suspense, useLayoutEffect, useCallback, useEffect } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Center, TransformControls } from '@react-three/drei';
import { Button, Stack, Divider, Paper, Typography, TextField, Box } from '@mui/material';
import * as THREE from 'three';
import { STLLoader, OBJLoader } from 'three-stdlib'; // Import loaders from three-stdlib
import Papa from 'papaparse';
import './App.css';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// Interfaces for CSV data
interface WeldPoint { id: string; process: string; x: number; y: number; z: number; gun?: string; notes?: string; }
interface Locator { id: string; process: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; notes?: string; }
interface Pin { id: string; process: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number; notes?: string; }
type SceneObjectData = WeldPoint | Locator | Pin;

// Type for selected object state
type SelectedObject = { type: 'weldPoint' | 'locator' | 'pin'; id: string } | null;

// Helper function to convert degrees to radians and vice versa
const degToRad = THREE.MathUtils.degToRad;
const radToDeg = THREE.MathUtils.radToDeg;

// --- 3D Object Components --- (unchanged)
interface ObjectProps { isSelected: boolean; onSelect: (mesh: THREE.Object3D) => void; }
const WeldPointObject: React.FC<{ point: WeldPoint } & ObjectProps> = ({ point, isSelected, onSelect }) => { /* ... */
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'red';
  return ( <mesh ref={meshRef} key={`wp-${point.id}`} position={[point.x, point.y, point.z]} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <sphereGeometry args={[0.1, 16, 16]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};
const LocatorObject: React.FC<{ locator: Locator } & ObjectProps> = ({ locator, isSelected, onSelect }) => { /* ... */
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'green'; const rotation = new THREE.Euler(degToRad(locator.rx ?? 0), degToRad(locator.ry ?? 0), degToRad(locator.rz ?? 0));
  return ( <mesh ref={meshRef} key={`loc-${locator.id}`} position={[locator.x, locator.y, locator.z]} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <boxGeometry args={[0.5, 0.2, 0.2]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};
const PinObject: React.FC<{ pin: Pin } & ObjectProps> = ({ pin, isSelected, onSelect }) => { /* ... */
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'blue'; const rotation = new THREE.Euler(degToRad(pin.rx ?? 0), degToRad(pin.ry ?? 0), degToRad(pin.rz ?? 0));
  return ( <mesh ref={meshRef} key={`pin-${pin.id}`} position={[pin.x, pin.y, pin.z]} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};

// Model Component (unchanged)
function Model({ url, fileType }: { url: string, fileType: 'stl' | 'obj' }) { /* ... */
  const loader = fileType === 'stl' ? STLLoader : OBJLoader; const geom = useLoader(loader as any, url); const ref = useRef<THREE.Object3D>(null!);
  useLayoutEffect(() => { if (!ref.current) return; ref.current.traverse((child) => { if (child instanceof THREE.Mesh) { const applyDoubleSide = (material: THREE.Material | THREE.Material[]) => { if (Array.isArray(material)) material.forEach(m => m.side = THREE.DoubleSide); else material.side = THREE.DoubleSide; }; if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: 'gray', side: THREE.DoubleSide }); else applyDoubleSide(child.material); } }); const box = new THREE.Box3().setFromObject(ref.current); const center = box.getCenter(new THREE.Vector3()); ref.current.position.sub(center); }, [geom]);
  if (fileType === 'obj' && geom instanceof THREE.Group) return <primitive ref={ref as React.MutableRefObject<THREE.Group>} object={geom} scale={1} />;
  if (fileType === 'stl' && geom instanceof THREE.BufferGeometry) return <mesh ref={ref as React.MutableRefObject<THREE.Mesh>} geometry={geom} scale={1}><meshStandardMaterial color="lightblue" side={THREE.DoubleSide} /></mesh>;
  return null;
}

// Function to trigger CSV download (unchanged)
const downloadCSV = (data: any[], filename: string) => { /* ... download logic ... */
  if (data.length === 0) { alert(`No data to export for ${filename}`); return; } const csv = Papa.unparse(data); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement('a'); const url = URL.createObjectURL(blob); link.setAttribute('href', url); link.setAttribute('download', filename); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
};

// --- Properties Panel Component ---
interface PropertiesPanelProps {
  selectedObjectData: SceneObjectData | null;
  onUpdate: (updatedData: Partial<SceneObjectData>) => void; // Callback to update parent state
}

// Define a type that includes all possible keys
type AllKeys = keyof WeldPoint | keyof Locator | keyof Pin;

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedObjectData, onUpdate }) => {
  // Use a more specific type for editData if possible, or any as a fallback
  const [editData, setEditData] = useState<Partial<WeldPoint & Locator & Pin>>({}); // Combine types for broader partial

  // Update local edit state when selected object changes
  useEffect(() => {
    setEditData(selectedObjectData ?? {});
  }, [selectedObjectData]);

  if (!selectedObjectData) return null;

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    // Attempt to parse numbers, keep as string if parsing fails or empty
    const parsedValue = value === '' ? '' : (isNaN(Number(value)) ? value : Number(value));
    setEditData(prev => ({ ...prev, [name]: parsedValue }));
  };

  // Handle update when focusing out of a field
  const handleBlur = (fieldName: AllKeys) => { // Use the combined key type
    const currentData = selectedObjectData as any; // Use any for easier access temporarily
    const editDataTyped = editData as any; // Use any for easier access temporarily
    const currentValue = currentData[fieldName];
    const editedValue = editDataTyped[fieldName];

    // Only call update if the value actually changed and is valid
    if (editedValue !== undefined && editedValue !== currentValue) {
        // Basic validation: ensure numbers are numbers if expected
        if (['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(fieldName as string)) {
            if (typeof editedValue === 'number' && !isNaN(editedValue)) {
                 // Cast fieldName to keyof SceneObjectData for onUpdate, assuming validation handles type safety
                 onUpdate({ [fieldName]: editedValue } as Partial<SceneObjectData>);
            } else {
                // Revert if invalid number input
                setEditData(prev => ({ ...prev, [fieldName]: currentValue }));
                console.warn(`Invalid number input for ${fieldName}. Reverting.`);
            }
        } else {
             // Cast fieldName to keyof SceneObjectData for onUpdate
             onUpdate({ [fieldName]: editedValue } as Partial<SceneObjectData>);
        }
    } else if (editedValue === '') {
        // Handle clearing a field (might need specific logic depending on field)
        // For now, revert if cleared field was previously non-empty
        if (currentValue !== undefined && currentValue !== '') {
             setEditData(prev => ({ ...prev, [fieldName]: currentValue }));
        }
    }
  };


  // Function to format number for display, handles potential undefined
  const formatForDisplay = (value: string | number | undefined): string => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'number') return value.toFixed(3); // Format numbers
      return String(value); // Return strings as is
  };


  return (
    <Paper elevation={3} sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1, p: 2, minWidth: 250, background: 'rgba(40,40,40,0.8)', color: 'white' }}>
      <Typography variant="h6" gutterBottom>Properties</Typography>
      <Box component="form" noValidate autoComplete="off">
        {/* Use type assertion or optional chaining for accessing potentially undefined properties */}
        <TextField label="ID" value={editData.id ?? ''} margin="dense" size="small" fullWidth InputProps={{ readOnly: true, style: { color: 'lightgray' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'lightgray !important' }, label: { color: 'lightgray' } }} />
        <TextField label="Process" name="process" value={editData.process ?? ''} onChange={handleInputChange} onBlur={() => handleBlur('process')} margin="dense" size="small" fullWidth InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="X" name="x" value={formatForDisplay(editData.x)} onChange={handleInputChange} onBlur={() => handleBlur('x')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="Y" name="y" value={formatForDisplay(editData.y)} onChange={handleInputChange} onBlur={() => handleBlur('y')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        <TextField label="Z" name="z" value={formatForDisplay(editData.z)} onChange={handleInputChange} onBlur={() => handleBlur('z')} margin="dense" size="small" fullWidth type="number" InputProps={{ style: { color: 'white' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'white !important' }, label: { color: 'lightgray' } }} />
        {/* Conditional rendering based on selectedObjectData type might be safer */}
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


// Main App Component Wrapper
function App() {
  // State and handlers previously in SceneContent that need to be lifted up
  // because the buttons triggering them are now outside the Canvas
  const [weldPoints, setWeldPoints] = useState<WeldPoint[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [modelData, setModelData] = useState<{ url: string; fileType: 'stl' | 'obj' } | null>(null);

  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const weldPointFileInputRef = useRef<HTMLInputElement>(null);
  const locatorFileInputRef = useRef<HTMLInputElement>(null);
  const pinFileInputRef = useRef<HTMLInputElement>(null);

  // Generic CSV file handler (lifted from SceneContent)
  const handleCsvFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    dataType: string
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log(`Loading ${dataType} CSV:`, file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically convert numbers
      complete: (results) => {
        console.log(`${dataType} Data Loaded:`, results.data);
        // Basic validation (check for required columns)
        if (results.data.length > 0) {
            const firstRow = results.data[0] as any;
            if (!firstRow.id || firstRow.x === undefined || firstRow.y === undefined || firstRow.z === undefined) {
                alert(`Invalid ${dataType} CSV format. Missing required columns (id, x, y, z).`);
                console.error(`Invalid ${dataType} CSV format.`, firstRow);
                event.target.value = ''; // Reset file input
                return;
            }
        }
        setter(results.data as any[]); // Set state
        event.target.value = ''; // Reset file input
      },
      error: (error) => {
        alert(`Error parsing ${dataType} CSV: ${error.message}`);
        console.error(`Error parsing ${dataType} CSV:`, error);
        event.target.value = ''; // Reset file input
      },
    });
  };

  // Model file handler (lifted from SceneContent)
   const handleModelFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (fileType !== 'stl' && fileType !== 'obj') {
      alert('Unsupported file type. Please load STL or OBJ files.');
      event.target.value = ''; // Reset file input
      return;
    }

    const url = URL.createObjectURL(file);
    console.log(`Loading ${fileType.toUpperCase()} Model:`, file.name);
    setModelData({ url, fileType });
    event.target.value = ''; // Reset file input
  };

  // Trigger file input click (lifted from SceneContent)
  const handleLoadClick = (ref: React.RefObject<HTMLInputElement>) => ref.current?.click();

  // Clean up object URL (lifted from SceneContent)
   useLayoutEffect(() => {
    return () => {
      if (modelData?.url) {
        URL.revokeObjectURL(modelData.url);
        console.log("Revoked Model Object URL:", modelData.url);
      }
    };
  }, [modelData]);


  return (
    <div className="App">
      {/* --- Control Panel (Buttons) --- */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, background: 'rgba(40,40,40,0.8)', padding: '10px', borderRadius: '5px', color: 'white' }}>
        <Stack direction="column" spacing={1}>
            {/* Hidden file inputs */}
            <input type="file" ref={modelFileInputRef} onChange={handleModelFileChange} style={{ display: 'none' }} accept=".stl,.obj" />
            <input type="file" ref={weldPointFileInputRef} onChange={(e) => handleCsvFileChange(e, setWeldPoints, 'Weld Point')} style={{ display: 'none' }} accept=".csv" />
            <input type="file" ref={locatorFileInputRef} onChange={(e) => handleCsvFileChange(e, setLocators, 'Locator')} style={{ display: 'none' }} accept=".csv" />
            <input type="file" ref={pinFileInputRef} onChange={(e) => handleCsvFileChange(e, setPins, 'Pin')} style={{ display: 'none' }} accept=".csv" />
            {/* Buttons to trigger file inputs */}
            <Button size="small" variant="contained" onClick={() => handleLoadClick(modelFileInputRef)}>Load Model</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(weldPointFileInputRef)}>Load Weld Points</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(locatorFileInputRef)}>Load Locators</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(pinFileInputRef)}>Load Pins</Button>
            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.5)' }} />
            {/* Buttons for export */}
            <Button size="small" variant="outlined" onClick={() => downloadCSV(weldPoints, 'weld_points_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Weld Points</Button>
            <Button size="small" variant="outlined" onClick={() => downloadCSV(locators, 'locators_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Locators</Button>
            <Button size="small" variant="outlined" onClick={() => downloadCSV(pins, 'pins_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Pins</Button>
        </Stack>
      </div>

      {/* --- Canvas for 3D Scene --- */}
      <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
        <Canvas camera={{ position: [0, 5, 10] }}>
          {/* Pass necessary state and handlers down to SceneContent */}
          <SceneContent
            modelData={modelData}
            weldPoints={weldPoints}
            locators={locators}
            pins={pins}
            setWeldPoints={setWeldPoints} // Pass setters if SceneContent needs to modify them directly (e.g., via TransformControls)
            setLocators={setLocators}
            setPins={setPins}
          />
        </Canvas>
      </div>
    </div>
  );
}

export default App;

// --- SceneContent Component (Modified) ---
// Props now include state and potentially setters passed from App
interface SceneContentProps {
  modelData: { url: string; fileType: 'stl' | 'obj' } | null;
  weldPoints: WeldPoint[];
  locators: Locator[];
  pins: Pin[];
  setWeldPoints: React.Dispatch<React.SetStateAction<WeldPoint[]>>;
  setLocators: React.Dispatch<React.SetStateAction<Locator[]>>;
  setPins: React.Dispatch<React.SetStateAction<Pin[]>>;
}

function SceneContent({
  modelData,
  weldPoints,
  locators,
  pins,
  setWeldPoints, // Receive setters
  setLocators,
  setPins
}: SceneContentProps) {
  const orbitControlsRef = useRef<OrbitControlsImpl>(null!);
  const transformControlsRef = useRef<any>(null!);

  // Remove state/refs related to file inputs as they are handled in App
  // const modelFileInputRef = useRef<HTMLInputElement>(null);
  // ... other file input refs ...
  // const [modelData, setModelData] = useState ... (received as prop)
  // const [weldPoints, setWeldPoints] = useState ... (received as prop)
  // ... other state ...

  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [selectedMesh, setSelectedMesh] = useState<THREE.Object3D | null>(null);
  const [selectedObjectData, setSelectedObjectData] = useState<SceneObjectData | null>(null);

  // Remove file handling functions (handleCsvFileChange, handleModelFileChange, handleLoadClick)
  // as they are now in App component

  // Handle object selection (unchanged logic, uses props for data)
  const handleSelect = (type: 'weldPoint' | 'locator' | 'pin', id: string, mesh: THREE.Object3D) => {
    setSelectedObject({ type, id });
    setSelectedMesh(mesh);
    let data: SceneObjectData | undefined;
    if (type === 'weldPoint') data = weldPoints.find(p => p.id === id);
    else if (type === 'locator') data = locators.find(l => l.id === id);
    else if (type === 'pin') data = pins.find(p => p.id === id);
    setSelectedObjectData(data ?? null);
    console.log(`Selected ${type}: ${id}`, data);
  };

  // Deselect when clicking background or non-interactive object (unchanged)
  const handleDeselect = useCallback(() => {
    if (!transformControlsRef.current?.dragging) {
      setSelectedObject(null);
      setSelectedMesh(null);
      setSelectedObjectData(null);
      console.log('Deselected');
    }
  }, []);

  // Update data from TransformControls or PropertiesPanel (uses setters from props)
  const updateObjectData = useCallback((id: string, type: 'weldPoint' | 'locator' | 'pin', updates: Partial<WeldPoint | Locator | Pin>) => {
    console.log(`Updating ${type} ${id} from ${Object.keys(updates).join(', ')}:`, updates);

    let foundItem: SceneObjectData | null = null;
    const updateState = (setter: React.Dispatch<React.SetStateAction<any[]>>) => {
        setter(prev => prev.map(item => {
            if (item.id === id) {
                foundItem = { ...item, ...updates };
                return foundItem;
            }
            return item;
        }));
    };

    switch (type) {
      case 'weldPoint': updateState(setWeldPoints); break;
      case 'locator': updateState(setLocators); break;
      case 'pin': updateState(setPins); break;
    }

    // Update the selectedObjectData state if the selected object was updated
    if (selectedObject?.id === id && foundItem) {
        setSelectedObjectData(foundItem);
    }

    // Also update the 3D mesh directly for immediate feedback if updated via panel
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
            if (!currentRotation.equals(selectedMesh.rotation)) {
                 selectedMesh.rotation.copy(currentRotation);
            }
        }
    }
  }, [selectedObject, selectedMesh, setWeldPoints, setLocators, setPins]); // Add setters to dependencies


  // Update data when transform finishes (unchanged logic)
  const handleTransformEnd = useCallback(() => {
    if (!selectedObject || !selectedMesh) return;
    const { position, rotation } = selectedMesh; const { type, id } = selectedObject;
    let updates: Partial<WeldPoint | Locator | Pin> = { x: position.x, y: position.y, z: position.z }; // Use wider type
    if (type !== 'weldPoint') {
        updates = { ...updates, rx: radToDeg(rotation.x), ry: radToDeg(rotation.y), rz: radToDeg(rotation.z) };
    }
    updateObjectData(id, type, updates);
  }, [selectedObject, selectedMesh, updateObjectData]);

  // Handle updates from Properties Panel (unchanged logic)
  const handlePropertyUpdate = useCallback((updates: Partial<SceneObjectData>) => {
      if (selectedObject) {
          updateObjectData(selectedObject.id, selectedObject.type, updates as Partial<WeldPoint | Locator | Pin>);
      }
  }, [selectedObject, updateObjectData]);


  // Effect to disable OrbitControls while dragging TransformControls (unchanged)
  useEffect(() => {
    const control = transformControlsRef.current; const orbit = orbitControlsRef.current; if (!control || !orbit) return;
    const callback = (event: THREE.Event) => { const dragging = (event.target as any)?.dragging; orbit.enabled = !dragging; };
    control.addEventListener('dragging-changed', callback);
    return () => { control.removeEventListener('dragging-changed', callback); };
  }, []);


  return (
    <>
      {/* Remove File Inputs and Buttons as they are now in App */}
      {/* <div style={{ position: 'absolute', ... }}> ... </div> */}

      {/* Properties Panel (now positioned relative to Canvas container) */}
      <PropertiesPanel selectedObjectData={selectedObjectData} onUpdate={handlePropertyUpdate} />

      {/* Clickable background for deselect (unchanged) */}
      <mesh scale={1000} onClick={handleDeselect} > <planeGeometry /> <meshBasicMaterial visible={false} /> </mesh>

      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />
      <Suspense fallback={null}>
        {/* Render Model (uses prop) */}
        {modelData ? ( <Center> <Model url={modelData.url} fileType={modelData.fileType} /> </Center> )
         : ( <mesh> <boxGeometry args={[1, 1, 1]} /> <meshStandardMaterial color="orange" /> </mesh> )}

        {/* Render Objects (uses props) */}
        {weldPoints.map((point) => ( <WeldPointObject key={`wp-${point.id}`} point={point} isSelected={selectedObject?.type === 'weldPoint' && selectedObject.id === point.id} onSelect={(mesh) => handleSelect('weldPoint', point.id, mesh)} /> ))}
        {locators.map((loc) => ( <LocatorObject key={`loc-${loc.id}`} locator={loc} isSelected={selectedObject?.type === 'locator' && selectedObject.id === loc.id} onSelect={(mesh) => handleSelect('locator', loc.id, mesh)} /> ))}
        {pins.map((pin) => ( <PinObject key={`pin-${pin.id}`} pin={pin} isSelected={selectedObject?.type === 'pin' && selectedObject.id === pin.id} onSelect={(mesh) => handleSelect('pin', pin.id, mesh)} /> ))}

        {/* Render TransformControls (unchanged) */}
        {selectedMesh && (
          <TransformControls ref={transformControlsRef} object={selectedMesh} mode={selectedObject?.type === 'weldPoint' ? 'translate' : 'translate'} onMouseUp={handleTransformEnd} size={0.5} />
        )}

      </Suspense>
      {/* Add ref to OrbitControls (unchanged) */}
      <OrbitControls makeDefault ref={orbitControlsRef} />
      <gridHelper args={[100, 100]} />
    </>
  );
}