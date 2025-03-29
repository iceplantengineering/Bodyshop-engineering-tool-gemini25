# Welding Engineering Tool

## 概要

このアプリケーションは、溶接エンジニアリングプロセスで使用される 3D モデル (STL/OBJ) と関連データ (溶接点、ロケーター、ピンの CSV データ) を視覚化および編集するためのツールです。

## 主な機能

*   STL および OBJ 形式の 3D モデルの読み込みと表示
*   溶接点、ロケーター、ピンの位置を示す CSV データの読み込みと 3D 空間への表示
*   3D 空間でのオブジェクト（溶接点、ロケーター、ピン）の選択と移動
*   選択したオブジェクトのプロパティ（座標、回転、メモなど）の表示と編集
*   編集したデータの CSV 形式でのエクスポート

## セットアップ

1.  **依存関係のインストール:**
    ```bash
    npm install
    ```

2.  **開発サーバーの起動:**
    ```bash
    npm run dev
    ```
    これにより、通常 `http://localhost:5173` でアプリケーションが起動します。

## 使用技術

*   React
*   TypeScript
*   Vite
*   Three.js / React Three Fiber (@react-three/fiber, @react-three/drei)
*   Material UI (@mui/material)
*   PapaParse (CSV 解析)