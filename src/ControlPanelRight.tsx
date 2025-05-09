import React from 'react';
import * as THREE from 'three'; // Import THREE
import {
  Paper, Stack, Typography, Divider, Switch, FormControlLabel, Button,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText, IconButton, Box
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

import { WeldPoint, Locator, Pin, SelectedObject, SceneObjectData } from './App'; // Assuming types are exported from App.tsx or a types file
// SceneObjectData をインポートリストに追加 (WeldPoint | Locator | Pin のエイリアスとして)
 
interface ControlPanelRightProps {
  showModel: boolean;
  setShowModel: (show: boolean) => void;
  showWeldPoints: boolean;
  setShowWeldPoints: (show: boolean) => void;
  showLocators: boolean;
  setShowLocators: (show: boolean) => void;
  showPins: boolean;
  setShowPins: (show: boolean) => void;
  weldPoints: WeldPoint[];
  locators: Locator[];
  pins: Pin[];
  selectedObject: SelectedObject;
  handleSelect: (type: 'weldPoint' | 'locator' | 'pin', id: string, mesh: THREE.Object3D | null) => void; // Allow null mesh for selection from list
  addElement: (type: 'weldPoint' | 'locator' | 'pin') => void;
  deleteSelectedElement: () => void;
  modelFileName: string | null; // 追加
}
 
const ControlPanelRight: React.FC<ControlPanelRightProps> = ({
  showModel, setShowModel,
  showWeldPoints, setShowWeldPoints,
  showLocators, setShowLocators,
  showPins, setShowPins,
  weldPoints, locators, pins,
  selectedObject, handleSelect,
  addElement, deleteSelectedElement,
  modelFileName // 追加
}) => {
 
  const handleGenerateSlice = async (type: 'locator') => {
    console.log("handleGenerateSlice called. Type:", type); // ★追加: 関数呼び出し確認

    if (!modelFileName) {
      alert("OBJモデルがロードされていません。");
      console.error("handleGenerateSlice: modelFileName is null.");
      return;
    }
    // ★修正: selectedObject の存在と type をより厳密にチェック
    if (!selectedObject || selectedObject.type !== type || selectedObject.id === null || selectedObject.id === undefined) {
      alert(`${type} が正しく選択されていません。`);
      console.error("handleGenerateSlice: Selected object is invalid or not a locator.", selectedObject);
      return;
    }

    let selectedData: Locator | undefined;
    if (type === 'locator') {
      selectedData = locators.find(loc => loc.id === selectedObject.id);
    } else {
      alert(`現在、${type} の断面生成はサポートされていません。LOCATORを選択してください。`);
      return;
    }

    if (!selectedData) {
      alert("選択されたオブジェクトのデータが見つかりません。");
      console.error("handleGenerateSlice: selectedData not found for ID:", selectedObject.id);
      return;
    }

    const payload = {
      obj_file_path: modelFileName,
      locators: [selectedData]
    };

    console.log("Payload object to be sent:", payload);
    try {
      const jsonStringPayload = JSON.stringify(payload); // ★追加: stringifyをtry-catchの外へ
      console.log("JSON string to be sent:", jsonStringPayload);

      const response = await fetch('http://localhost:5000/slice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonStringPayload, // ★変更: 事前にstringifyした変数を使用
      });

      // ★追加: レスポンスのステータスコードもログに出力
      console.log("API Response Status:", response.status);

      const resultText = await response.text(); // ★変更: まずテキストで結果を取得
      console.log("Raw API Response Text:", resultText);

      if (response.ok) {
        try {
          const resultJson = JSON.parse(resultText); // ★追加: テキストからJSONへパース
          alert(`断面生成リクエスト成功: ${resultJson.message}\n詳細はサーバーログと生成された画像を確認してください。`);
          console.log("API Success (Parsed JSON):", resultJson);
        } catch (e) {
          alert(`断面生成リクエスト成功しましたが、レスポンスJSONの解析に失敗しました。\nサーバーレスポンス: ${resultText}`);
          console.error("API Success, but JSON parse error:", e, "Raw text:", resultText);
        }
      } else {
        try {
          const errorJson = JSON.parse(resultText); // ★追加: エラーレスポンスもJSONパース試行
          alert(`断面生成リクエスト失敗 (ステータス: ${response.status}): ${errorJson.error}\n${errorJson.details || ''}\n詳細はサーバーログを確認してください。`);
          console.error("API Error (Parsed JSON):", errorJson);
        } catch (e) {
          alert(`断面生成リクエスト失敗 (ステータス: ${response.status})。\nサーバーからの応答: ${resultText}`);
          console.error("API Error, JSON parse error or not JSON:", e, "Raw text:", resultText);
        }
      }
    } catch (error) {
      // ★修正: エラーの種類をより具体的に表示
      if (error instanceof TypeError && error.message === "Failed to fetch") {
          alert(`APIリクエスト中にネットワークエラーが発生しました: Failed to fetch.\nサーバーが起動しているか、URL (http://localhost:5000/slice) が正しいか、CORS設定が有効か確認してください。`);
      } else {
          alert(`APIリクエスト中に予期せぬエラーが発生しました: ${error}`);
      }
      console.error("API Fetch/Processing Error:", error);
    }
  };

  // Helper to find the mesh (simplified, might need adjustment based on actual scene access)
  const findMeshInScene = (type: 'weldPoint' | 'locator' | 'pin', id: string): THREE.Object3D | null => {
      // This is a placeholder. In a real scenario, you might need access
      // to the scene object or a map of IDs to meshes.
      // For now, we pass null, assuming handleSelect can manage this.
      console.warn("findMeshInScene is a placeholder and needs proper implementation if direct mesh reference is required from panel selection.");
      return null;
  };

  const handleListItemClick = (type: 'weldPoint' | 'locator' | 'pin', id: string) => {
      const mesh = findMeshInScene(type, id); // Attempt to find mesh (might return null)
      handleSelect(type, id, mesh);
  };

  const renderListItems = <T extends { id: string; process?: string }>(
      items: T[],
      type: 'weldPoint' | 'locator' | 'pin'
  ) => (
      <List dense sx={{ maxHeight: '150px', overflowY: 'auto', width: '100%', bgcolor: 'rgba(60,60,60,0.7)', borderRadius: '4px', padding: '0 5px' }}>
          {items.map((item) => (
              <ListItem
                  key={item.id}
                  disablePadding
                  button
                  selected={selectedObject?.type === type && selectedObject?.id === item.id}
                  onClick={() => handleListItemClick(type, item.id)}
                  sx={{
                      padding: '2px 8px', // Reduced padding
                      fontSize: '0.75rem', // Smaller font size
                      '&.Mui-selected': {
                          backgroundColor: 'rgba(0, 150, 255, 0.3)',
                      },
                      '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      },
                  }}
              >
                  <ListItemText
                      primary={item.id}
                      secondary={item.process ? `Process: ${item.process}` : null}
                      primaryTypographyProps={{ fontSize: '0.75rem', color: 'white' }}
                      secondaryTypographyProps={{ fontSize: '0.65rem', color: 'lightgray' }}
                  />
              </ListItem>
          ))}
      </List>
  );

  return (
      <Paper
          elevation={3}
          sx={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 1,
              p: 1.5, // Reduced padding
              width: 280, // Slightly wider for controls
              maxHeight: 'calc(95vh - 20px)', // Adjust based on top/bottom padding
              overflowY: 'auto',
              background: 'rgba(40, 40, 40, 0.85)', // Slightly more opaque
              color: 'white',
              fontSize: '0.8rem', // Smaller base font size for the panel
              '& .MuiTypography-root': { fontSize: 'inherit' }, // Inherit smaller font size
              '& .MuiButton-root': { fontSize: '0.7rem', minWidth: 'auto', padding: '3px 8px' }, // Smaller buttons
              '& .MuiSvgIcon-root': { fontSize: '1rem' }, // Smaller icons
              '& .MuiFormControlLabel-label': { fontSize: '0.8rem' }, // Smaller switch labels
              '& .MuiAccordionSummary-content': { margin: '8px 0' }, // Reduced margin in accordion summary
              '& .MuiAccordionDetails-root': { padding: '4px 8px 8px' }, // Reduced padding in accordion details
          }}
      >
          <Stack direction="column" spacing={1}>
              <Typography variant="caption" sx={{ color: 'lightgray', fontWeight: 'bold' }}>Visibility</Typography>
              <FormControlLabel control={<Switch size="small" checked={showModel} onChange={(e) => setShowModel(e.target.checked)} />} label="Model" sx={{ color: 'white' }} />
              <FormControlLabel control={<Switch size="small" checked={showWeldPoints} onChange={(e) => setShowWeldPoints(e.target.checked)} />} label="Weld Points" sx={{ color: 'white' }} />
              <FormControlLabel control={<Switch size="small" checked={showLocators} onChange={(e) => setShowLocators(e.target.checked)} />} label="Locators" sx={{ color: 'white' }} />
              <FormControlLabel control={<Switch size="small" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />} label="Pins" sx={{ color: 'white' }} />

              <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.3)' }} />

              <Typography variant="caption" sx={{ color: 'lightgray', fontWeight: 'bold' }}>Manage Elements</Typography>

              {/* Weld Points Accordion */}
              <Accordion sx={{ background: 'rgba(50,50,50,0.8)', color: 'white', '&.Mui-expanded': { margin: '2px 0'} }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />} sx={{ minHeight: '36px' }}>
                      <Typography variant="body2">Weld Points ({weldPoints.length})</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                      <Stack spacing={1}>
                          {renderListItems(weldPoints, 'weldPoint')}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => addElement('weldPoint')}>Add WP</Button>
                              <IconButton size="small" onClick={deleteSelectedElement} disabled={selectedObject?.type !== 'weldPoint'} sx={{ color: selectedObject?.type === 'weldPoint' ? 'pink' : 'grey' }}>
                                  <DeleteIcon />
                              </IconButton>
                          </Box>
                      </Stack>
                  </AccordionDetails>
              </Accordion>

              {/* Locators Accordion */}
              <Accordion sx={{ background: 'rgba(50,50,50,0.8)', color: 'white', '&.Mui-expanded': { margin: '2px 0'} }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />} sx={{ minHeight: '36px' }}>
                      <Typography variant="body2">Locators ({locators.length})</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                      <Stack spacing={1}>
                          {renderListItems(locators, 'locator')}
                           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => addElement('locator')}>Add LT</Button>
                              <IconButton size="small" onClick={deleteSelectedElement} disabled={selectedObject?.type !== 'locator'} sx={{ color: selectedObject?.type === 'locator' ? 'pink' : 'grey' }}>
                                  <DeleteIcon />
                              </IconButton>
                          </Box>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleGenerateSlice('locator')}
                            disabled={!selectedObject || selectedObject.type !== 'locator' || !modelFileName}
                            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', mt: 0.5, width: '100%' }}
                          >
                            選択Locator断面生成
                          </Button>
                      </Stack>
                  </AccordionDetails>
              </Accordion>

              {/* Pins Accordion */}
              <Accordion sx={{ background: 'rgba(50,50,50,0.8)', color: 'white', '&.Mui-expanded': { margin: '2px 0'} }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />} sx={{ minHeight: '36px' }}>
                      <Typography variant="body2">Pins ({pins.length})</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                      <Stack spacing={1}>
                          {renderListItems(pins, 'pin')}
                           <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => addElement('pin')}>Add Pin</Button>
                              <IconButton size="small" onClick={deleteSelectedElement} disabled={selectedObject?.type !== 'pin'} sx={{ color: selectedObject?.type === 'pin' ? 'pink' : 'grey' }}>
                                  <DeleteIcon />
                              </IconButton>
                          </Box>
                      </Stack>
                  </AccordionDetails>
              </Accordion>

          </Stack>
      </Paper>
  );
};

export default ControlPanelRight;