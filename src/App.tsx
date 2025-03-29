import React, { useRef, useState, Suspense, useLayoutEffect, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Canvas, useLoader, useThree, RootState } from '@react-three/fiber';
// Center, TransformControls, OrbitControls をインポート
import { Center, TransformControls, OrbitControls } from '@react-three/drei';
import { Button, Stack, Divider, Paper, Typography, TextField, Box, ButtonGroup, Select, MenuItem, FormControl, InputLabel, SelectChangeEvent } from '@mui/material';
import * as THREE from 'three';
import { STLLoader, OBJLoader } from 'three-stdlib';
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

// --- 3D Object Components ---
interface ObjectProps { isSelected: boolean; onSelect: (mesh: THREE.Object3D) => void; }
const WeldPointObject: React.FC<{ point: WeldPoint } & ObjectProps> = ({ point, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'red';
  return ( <mesh ref={meshRef} name={`weldpoint-${point.id}`} userData={{ type: 'weldPoint' }} key={`wp-${point.id}`} position={[point.x, point.y, point.z]} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <sphereGeometry args={[10, 16, 16]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};
const LocatorObject: React.FC<{ locator: Locator } & ObjectProps> = ({ locator, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'green'; const rotation = new THREE.Euler(degToRad(locator.rx ?? 0), degToRad(locator.ry ?? 0), degToRad(locator.rz ?? 0));
  return ( <mesh ref={meshRef} name={`locator-${locator.id}`} userData={{ type: 'locator' }} key={`loc-${locator.id}`} position={[locator.x, locator.y, locator.z]} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <boxGeometry args={[0.5, 0.2, 0.2]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};
const PinObject: React.FC<{ pin: Pin } & ObjectProps> = ({ pin, isSelected, onSelect }) => {
  const meshRef = useRef<THREE.Mesh>(null!); const color = isSelected ? 'yellow' : 'blue'; const rotation = new THREE.Euler(degToRad(pin.rx ?? 0), degToRad(pin.ry ?? 0), degToRad(pin.rz ?? 0));
  return ( <mesh ref={meshRef} name={`pin-${pin.id}`} userData={{ type: 'pin' }} key={`pin-${pin.id}`} position={[pin.x, pin.y, pin.z]} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(meshRef.current); }} > <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} /> <meshStandardMaterial color={color} emissive={isSelected ? color : undefined} emissiveIntensity={isSelected ? 0.5 : 0} /> </mesh> );
};

// Model Component
function Model({ url, fileType }: { url: string, fileType: 'stl' | 'obj' }) {
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
}
type AllKeys = keyof WeldPoint | keyof Locator | keyof Pin;
const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedObjectData, onUpdate }) => {
  const [editData, setEditData] = useState<Partial<WeldPoint & Locator & Pin>>({});
  useEffect(() => { setEditData(selectedObjectData ?? {}); }, [selectedObjectData]);
  if (!selectedObjectData) return null;
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { const { name, value } = event.target; const parsedValue = value === '' ? '' : (isNaN(Number(value)) ? value : Number(value)); setEditData(prev => ({ ...prev, [name]: parsedValue })); };
  const handleBlur = (fieldName: AllKeys) => { const currentData = selectedObjectData as any; const editDataTyped = editData as any; const currentValue = currentData[fieldName]; const editedValue = editDataTyped[fieldName]; if (editedValue !== undefined && editedValue !== currentValue) { if (['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(fieldName as string)) { if (typeof editedValue === 'number' && !isNaN(editedValue)) { onUpdate({ [fieldName]: editedValue } as Partial<SceneObjectData>); } else { setEditData(prev => ({ ...prev, [fieldName]: currentValue })); console.warn(`Invalid number input for ${fieldName}. Reverting.`); } } else { onUpdate({ [fieldName]: editedValue } as Partial<SceneObjectData>); } } else if (editedValue === '') { if (currentValue !== undefined && currentValue !== '') { setEditData(prev => ({ ...prev, [fieldName]: currentValue })); } } };
  const formatForDisplay = (value: string | number | undefined): string => { if (value === undefined || value === null) return ''; if (typeof value === 'number') return value.toFixed(3); return String(value); };
  return (
    <Paper elevation={3} sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1, p: 2, minWidth: 250, background: 'rgba(40,40,40,0.8)', color: 'white' }}>
      <Typography variant="h6" gutterBottom>Properties</Typography>
      <Box component="form" noValidate autoComplete="off">
        <TextField label="ID" value={editData.id ?? ''} margin="dense" size="small" fullWidth InputProps={{ readOnly: true, style: { color: 'lightgray' } }} InputLabelProps={{ style: { color: 'lightgray' } }} sx={{ input: { '-webkit-text-fill-color': 'lightgray !important' }, label: { color: 'lightgray' } }} />
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
  const [weldPoints, setWeldPoints] = useState<WeldPoint[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [modelData, setModelData] = useState<{ url: string; fileType: 'stl' | 'obj' } | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<string>('ALL');
  const [availableProcesses, setAvailableProcesses] = useState<string[]>(['ALL']);

  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const weldPointFileInputRef = useRef<HTMLInputElement>(null);
  const locatorFileInputRef = useRef<HTMLInputElement>(null);
  const pinFileInputRef = useRef<HTMLInputElement>(null);
  const sceneContentRef = useRef<SceneContentHandles>(null);

  const handleCsvFileChange = ( event: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<any[]>>, dataType: string ) => {
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
        setter(results.data as any[]);
        event.target.value = '';

        if (dataType === 'Weld Point') {
          const processes = [...new Set(results.data.map((item: any) => item.process).filter(Boolean))] as string[];
          const newAvailableProcesses = ['ALL', ...processes];
          setAvailableProcesses(newAvailableProcesses);
          if (!newAvailableProcesses.includes(selectedProcess)) {
            setSelectedProcess('ALL');
          }
        }
      },
      error: (error) => { alert(`Error parsing ${dataType} CSV: ${error.message}`); console.error(`Error parsing ${dataType} CSV:`, error); event.target.value = ''; },
    });
  };

  const handleModelFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const fileType = file.name.split('.').pop()?.toLowerCase();
    if (fileType !== 'stl' && fileType !== 'obj') { alert('Unsupported file type. Please load STL or OBJ files.'); event.target.value = ''; return; }
    const url = URL.createObjectURL(file); console.log(`Loading ${fileType.toUpperCase()} Model:`, file.name); setModelData({ url, fileType }); event.target.value = '';
  };

  const handleLoadClick = (ref: React.RefObject<HTMLInputElement>) => ref.current?.click();

  useLayoutEffect(() => { return () => { if (modelData?.url) { URL.revokeObjectURL(modelData.url); console.log("Revoked Model Object URL:", modelData.url); } }; }, [modelData]);

  const handleSetView = (direction: 'x' | 'y' | 'z' | 'xyz') => {
    sceneContentRef.current?.setView(direction);
  };

  const handleProcessChange = (event: SelectChangeEvent<string>) => {
    setSelectedProcess(event.target.value);
  };

  const filteredWeldPoints = useMemo(() => {
    console.log("Filtering WP for process:", selectedProcess);
    if (selectedProcess === 'ALL') {
      return weldPoints;
    }
    return weldPoints.filter(wp => wp.process === selectedProcess);
  }, [weldPoints, selectedProcess]);

  return (
    <div className="App">
      {/* --- Control Panel (Buttons) --- */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, background: 'rgba(40,40,40,0.8)', padding: '10px', borderRadius: '5px', color: 'white' }}>
        <Stack direction="column" spacing={1}>
            <input type="file" ref={modelFileInputRef} onChange={handleModelFileChange} style={{ display: 'none' }} accept=".stl,.obj" />
            <input type="file" ref={weldPointFileInputRef} onChange={(e) => handleCsvFileChange(e, setWeldPoints, 'Weld Point')} style={{ display: 'none' }} accept=".csv" />
            <input type="file" ref={locatorFileInputRef} onChange={(e) => handleCsvFileChange(e, setLocators, 'Locator')} style={{ display: 'none' }} accept=".csv" />
            <input type="file" ref={pinFileInputRef} onChange={(e) => handleCsvFileChange(e, setPins, 'Pin')} style={{ display: 'none' }} accept=".csv" />
            <Button size="small" variant="contained" onClick={() => handleLoadClick(modelFileInputRef)}>Load Model</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(weldPointFileInputRef)}>Load Weld Points</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(locatorFileInputRef)}>Load Locators</Button>
            <Button size="small" variant="contained" onClick={() => handleLoadClick(pinFileInputRef)}>Load Pins</Button>
            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.5)' }} />
            <FormControl size="small" sx={{ m: 1, minWidth: 120, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' }, '& .MuiSvgIcon-root': { color: 'white' }, '& .MuiInputLabel-root': { color: 'lightgray' }, '& .MuiSelect-select': { color: 'white' } }}>
              <InputLabel id="process-select-label">Filter Process</InputLabel>
              <Select
                labelId="process-select-label"
                id="process-select"
                value={selectedProcess}
                label="Filter Process"
                onChange={handleProcessChange}
              >
                {availableProcesses.map(proc => (
                  <MenuItem key={proc} value={proc}>{proc}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.5)' }} />
            <Button size="small" variant="outlined" onClick={() => downloadCSV(filteredWeldPoints, 'weld_points_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Filtered WP</Button>
            <Button size="small" variant="outlined" onClick={() => downloadCSV(locators, 'locators_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Locators</Button>
            <Button size="small" variant="outlined" onClick={() => downloadCSV(pins, 'pins_export.csv')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Export Pins</Button>
            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.5)' }} />
             <Typography variant="caption" sx={{ color: 'lightgray', mb: 0.5 }}>Camera Views</Typography>
             <ButtonGroup variant="outlined" size="small" aria-label="camera view controls">
                <Button onClick={() => handleSetView('x')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>X</Button>
                <Button onClick={() => handleSetView('y')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Y</Button>
                <Button onClick={() => handleSetView('z')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>Z</Button>
                <Button onClick={() => handleSetView('xyz')} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}>XYZ</Button>
             </ButtonGroup>
        </Stack>
      </div>

      {/* --- Canvas for 3D Scene --- */}
      <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
        <Canvas camera={{ position: [0, 50, 150], fov: 50, near: 0.1, far: 2000 }}>
          <SceneContent
            ref={sceneContentRef}
            modelData={modelData}
            weldPoints={filteredWeldPoints}
            locators={locators}
            pins={pins}
            setWeldPoints={setWeldPoints}
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
interface SceneContentProps {
  modelData: { url: string; fileType: 'stl' | 'obj' } | null;
  weldPoints: WeldPoint[];
  locators: Locator[];
  pins: Pin[];
  setWeldPoints: React.Dispatch<React.SetStateAction<WeldPoint[]>>;
  setLocators: React.Dispatch<React.SetStateAction<Locator[]>>;
  setPins: React.Dispatch<React.SetStateAction<Pin[]>>;
}

const SceneContent = forwardRef<SceneContentHandles, SceneContentProps>(({
  modelData,
  weldPoints,
  locators,
  pins,
  setWeldPoints,
  setLocators,
  setPins
}, ref) => {
  const orbitControlsRef = useRef<OrbitControlsImpl>(null!);
  const transformControlsRef = useRef<any>(null!);
  const { camera, scene, controls } = useThree((state: RootState) => ({
      camera: state.camera as THREE.PerspectiveCamera,
      scene: state.scene,
      controls: state.controls as OrbitControlsImpl | null
  }));

  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  const [selectedMesh, setSelectedMesh] = useState<THREE.Object3D | null>(null);
  const [selectedObjectData, setSelectedObjectData] = useState<SceneObjectData | null>(null);

  useImperativeHandle(ref, () => ({
    setView: (direction: 'x' | 'y' | 'z' | 'xyz') => {
      if (!controls || !(controls instanceof OrbitControlsImpl) || !camera) return;

      const box = new THREE.Box3();
      let objectsFound = false;

      // --- 修正: 表示中のオブジェクトのみを対象にする ---
      const objectsToFrame: THREE.Object3D[] = [];

      // 1. モデルを追加
      if (modelData) {
        const modelObject = scene.getObjectByName('loaded-model-obj') || scene.getObjectByName('loaded-model-stl');
        if (modelObject) {
          objectsToFrame.push(modelObject);
        }
      }
      // 2. 表示中のWPを追加 (weldPoints はフィルタリング済み)
      weldPoints.forEach(point => {
        const wpObject = scene.getObjectByName(`weldpoint-${point.id}`);
        if (wpObject) {
          objectsToFrame.push(wpObject);
        }
      });
      // 3. ロケーターを追加
      locators.forEach(loc => {
        const locObject = scene.getObjectByName(`locator-${loc.id}`);
        if (locObject) {
          objectsToFrame.push(locObject);
        }
      });
      // 4. ピンを追加
      pins.forEach(pin => {
        const pinObject = scene.getObjectByName(`pin-${pin.id}`);
        if (pinObject) {
          objectsToFrame.push(pinObject);
        }
      });

      // 境界ボックスを計算
      if (objectsToFrame.length > 0) {
          objectsToFrame.forEach(object => {
              object.updateMatrixWorld(); // ワールドマトリックスを更新
              const objectBox = new THREE.Box3().setFromObject(object, true);
              if (!objectBox.isEmpty()) {
                  if (!objectsFound) {
                      box.copy(objectBox);
                      objectsFound = true;
                  } else {
                      box.union(objectBox);
                  }
              }
          });
      }
      // --- 修正ここまで ---


      if (!objectsFound || box.isEmpty()) {
        console.warn("No visible objects found or bounding box is empty, cannot set view.");
        // デフォルトビューにリセット (または何もしない)
        controls.target.set(0, 0, 0);
        camera.position.set(0, 50, 150); // 初期位置に戻すなど
        controls.update();
        return;
      }

      // --- カメラ位置計算 (変更なし) ---
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 1.5 / Math.tan(fov / 2)); // 基本距離計算
      // --- 修正: パディング係数を 1.2 に変更 ---
      cameraZ *= 1.2; // Padding factor

      controls.target.copy(center);

      const offset = cameraZ > 0 ? cameraZ : 10; // 最小距離を確保

      // --- 修正: カメラの up ベクトルを設定 ---
      camera.up.set(0, 1, 0); // デフォルトのUpベクトル (Y軸が上)

      switch (direction) {
        case 'x':
          camera.position.set(center.x + offset, center.y, center.z);
          break;
        case 'y':
          camera.position.set(center.x, center.y + offset, center.z + 0.01); // Zをわずかにずらす
          // Y軸ビュー（上から見る）の場合、Z軸を上に設定
          camera.up.set(0, 0, -1);
          break;
        case 'z':
          camera.position.set(center.x, center.y, center.z + offset);
          break;
        case 'xyz':
        default:
          const diagOffset = offset * 0.707;
          camera.position.set(center.x + diagOffset, center.y + diagOffset, center.z + diagOffset);
          break;
      }

      console.log(`Direction: ${direction}, Camera Up Before LookAt:`, camera.up.toArray());
      camera.lookAt(center);
      // lookAt の後に up ベクトルが変更されることがあるため、再度設定が必要な場合がある
      // 特にY軸ビューの場合
      if (direction === 'y') {
          camera.up.set(0, 0, -1);
      } else {
          camera.up.set(0, 1, 0); // 他のビューではY軸を上にする
      }
      controls.update();
      console.log(`Set view to ${direction}. Center:`, center, "Size:", size, "Cam Pos:", camera.position);
    }
  }));

  const handleSelect = (type: 'weldPoint' | 'locator' | 'pin', id: string, mesh: THREE.Object3D) => {
    setSelectedObject({ type, id }); setSelectedMesh(mesh); let data: SceneObjectData | undefined;
    if (type === 'weldPoint') data = weldPoints.find(p => p.id === id);
    else if (type === 'locator') data = locators.find(l => l.id === id);
    else if (type === 'pin') data = pins.find(p => p.id === id);
    setSelectedObjectData(data ?? null); console.log(`Selected ${type}: ${id}`, data);
  };

  const handleDeselect = useCallback(() => { if (!transformControlsRef.current?.dragging) { setSelectedObject(null); setSelectedMesh(null); setSelectedObjectData(null); console.log('Deselected'); } }, []);

  const updateObjectData = useCallback((id: string, type: 'weldPoint' | 'locator' | 'pin', updates: Partial<WeldPoint | Locator | Pin>) => {
    console.log(`Updating ${type} ${id} from ${Object.keys(updates).join(', ')}:`, updates); let foundItem: SceneObjectData | null = null;
    const updateState = (setter: React.Dispatch<React.SetStateAction<any[]>>) => { setter(prev => prev.map(item => { if (item.id === id) { foundItem = { ...item, ...updates }; return foundItem; } return item; })); };
    switch (type) { case 'weldPoint': updateState(setWeldPoints); break; case 'locator': updateState(setLocators); break; case 'pin': updateState(setPins); break; }
    if (selectedObject?.id === id && foundItem) { setSelectedObjectData(foundItem); }
    if (selectedMesh && selectedObject?.id === id) { const updatesAny = updates as any; if (updatesAny.x !== undefined) selectedMesh.position.x = updatesAny.x; if (updatesAny.y !== undefined) selectedMesh.position.y = updatesAny.y; if (updatesAny.z !== undefined) selectedMesh.position.z = updatesAny.z; if (type !== 'weldPoint') { const currentRotation = selectedMesh.rotation.clone(); if (updatesAny.rx !== undefined) currentRotation.x = degToRad(updatesAny.rx); if (updatesAny.ry !== undefined) currentRotation.y = degToRad(updatesAny.ry); if (updatesAny.rz !== undefined) currentRotation.z = degToRad(updatesAny.rz); if (!currentRotation.equals(selectedMesh.rotation)) { selectedMesh.rotation.copy(currentRotation); } } }
  }, [selectedObject, selectedMesh, setWeldPoints, setLocators, setPins]);

  const handleTransformEnd = useCallback(() => { if (!selectedObject || !selectedMesh) return; const { position, rotation } = selectedMesh; const { type, id } = selectedObject; let updates: Partial<WeldPoint | Locator | Pin> = { x: position.x, y: position.y, z: position.z }; if (type !== 'weldPoint') { updates = { ...updates, rx: radToDeg(rotation.x), ry: radToDeg(rotation.y), rz: radToDeg(rotation.z) }; } updateObjectData(id, type, updates); }, [selectedObject, selectedMesh, updateObjectData]);

  const handlePropertyUpdate = useCallback((updates: Partial<SceneObjectData>) => { if (selectedObject) { updateObjectData(selectedObject.id, selectedObject.type, updates as Partial<WeldPoint | Locator | Pin>); } }, [selectedObject, updateObjectData]);

  useEffect(() => { const control = transformControlsRef.current; const orbit = orbitControlsRef.current; if (!control || !orbit) return; const callback = (event: THREE.Event) => { const dragging = (event.target as any)?.dragging; orbit.enabled = !dragging; }; control.addEventListener('dragging-changed', callback); return () => { control.removeEventListener('dragging-changed', callback); }; }, []);

  return (
    <>
      <PropertiesPanel selectedObjectData={selectedObjectData} onUpdate={handlePropertyUpdate} />
      <mesh scale={1000} onClick={handleDeselect} > <planeGeometry /> <meshBasicMaterial visible={false} /> </mesh>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />
      {/* 原点に軸を表示 (サイズは適宜調整) */}
      <axesHelper args={[50]} />
      <Suspense fallback={null}>
        {modelData ? ( <Center> <Model url={modelData.url} fileType={modelData.fileType} /> </Center> )
         : ( <mesh> <boxGeometry args={[1, 1, 1]} /> <meshStandardMaterial color="orange" /> </mesh> )}
        {weldPoints.map((point) => ( <WeldPointObject key={`wp-${point.id}`} point={point} isSelected={selectedObject?.type === 'weldPoint' && selectedObject.id === point.id} onSelect={(mesh) => handleSelect('weldPoint', point.id, mesh)} /> ))}
        {locators.map((loc) => ( <LocatorObject key={`loc-${loc.id}`} locator={loc} isSelected={selectedObject?.type === 'locator' && selectedObject.id === loc.id} onSelect={(mesh) => handleSelect('locator', loc.id, mesh)} /> ))}
        {pins.map((pin) => ( <PinObject key={`pin-${pin.id}`} pin={pin} isSelected={selectedObject?.type === 'pin' && selectedObject.id === pin.id} onSelect={(mesh) => handleSelect('pin', pin.id, mesh)} /> ))}
        {selectedMesh && (
          <TransformControls ref={transformControlsRef} object={selectedMesh} mode={selectedObject?.type === 'weldPoint' ? 'translate' : 'translate'} onMouseUp={handleTransformEnd} size={0.5} />
        )}
      </Suspense>
      <OrbitControls makeDefault ref={orbitControlsRef} />
      {/* グリッドをXY平面 (Z=0) に配置 */}
      <gridHelper args={[1000, 100]} rotation={[Math.PI / 2, 0, 0]} />
    </>
  );
});