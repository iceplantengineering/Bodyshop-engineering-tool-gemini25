import pyvista as pv # Open3Dの代わりにPyVistaをインポート
import numpy as np
import tempfile
from PIL import Image # PILは画像の最終調整や確認に使えるかもしれないが、PyVistaが直接保存可能
import os

# Open3D関連のcreate_slice_imageはPyVista版に置き換えるのでコメントアウトまたは削除
# def create_slice_image(mesh, plane_origin, plane_normal, locator_id, radius, output_dir="data"):
#    ... (旧Open3D版のコード) ...

def create_slice_image_pyvista(obj_file_path, plane_origin, plane_normal, locator_id, radius, output_dir="data"):
    """
    PyVistaを使用して、指定されたOBJファイルのメッシュを指定された平面でスライスし、
    その断面を画像として保存する。半径による範囲指定も考慮する。
    """
    print(f"PyVista: Processing LOCATOR ID: {locator_id}, Radius: {radius}")
    print(f"Plane Origin: {plane_origin}, Plane Normal: {plane_normal}")

    try:
        # 1. OBJファイルをPyVistaで読み込む
        # まずは堅牢なファイル読み込み（UTF-8、一時ファイル経由）をここでも適用
        temp_obj_file_pv = None
        try:
            with open(obj_file_path, 'r', encoding='utf-8', errors='ignore') as f_in_pv:
                obj_content_pv = f_in_pv.read()
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.obj', encoding='utf-8') as tmp_f_pv:
                tmp_f_pv.write(obj_content_pv)
                temp_obj_file_pv = tmp_f_pv.name
            
            mesh_pv = pv.read(temp_obj_file_pv)
            print(f"PyVista: Successfully read mesh from {temp_obj_file_pv}")
        except Exception as e_read_pv:
            print(f"PyVista: Error reading OBJ file {obj_file_path} (via temp): {e_read_pv}")
            return False
        finally:
            if temp_obj_file_pv and os.path.exists(temp_obj_file_pv):
                try:
                    os.remove(temp_obj_file_pv)
                except Exception: pass
        
        if not mesh_pv.n_points > 0: # メッシュが空でないか確認
             print(f"PyVista: Mesh from {obj_file_path} is empty or invalid.")
             return False

        # 2. メッシュを平面でスライスする
        # slice()メソッドは断面のポリライン(複数の場合もある)を生成する
        slice_polydata = mesh_pv.slice(normal=plane_normal, origin=plane_origin)

        if not slice_polydata or slice_polydata.n_points == 0:
            print(f"PyVista: Slice for locator {locator_id} resulted in no geometry (empty slice).")
            # 空の画像やエラーを示す画像を保存することもできる
            return True # 処理は試みたが断面がなかったケース

        # 3. (オプション) 半径200mmの範囲でクリッピング
        # スライスされたPolyData (通常は線分) をplane_origin中心の円でクリップする。
        # これは2Dクリッピングになる。PyVistaで直接的な2D円クリップは難しいかもしれない。
        # 代わりに、スライス結果の点群をフィルタリングする。
        points = slice_polydata.points
        distances = np.linalg.norm(points - plane_origin, axis=1)
        mask = distances <= radius
        
        # マスクされた点を含むセル（線分）を選択するのは少し複雑。
        # ここでは、まず断面全体を表示し、範囲指定は視覚的な中心合わせとズームで行う。
        # 真のクリッピングは後の改善とする。
        # if np.any(mask):
        #    # slice_polydata = slice_polydata.extract_points(mask) # これは点だけになる
        #    # 適切なクリッピング処理が必要
        #    print(f"PyVista: Clipping slice to radius {radius} (visual adjustment for now).")
        # else:
        #    print(f"PyVista: No points in slice within radius {radius} for locator {locator_id}.")
        #    return True # 断面はあったが範囲内に何もなかったケース

        # 4. 断面をプロットして画像として保存
        plotter = pv.Plotter(off_screen=True, window_size=[800, 600])
        plotter.add_mesh(slice_polydata, color='red', line_width=5) # 断面を赤色の線で表示

        # カメラ位置を調整して断面がよく見えるようにする
        plotter.camera.focal_point = plane_origin.tolist()
        # カメラ位置は、平面の法線方向から、断面が見えるように少し離れた位置
        plotter.camera.position = (plane_origin + plane_normal * radius * 0.5).tolist() # 距離は調整可能
        plotter.camera.up = tuple(calculate_camera_up_vector(plane_normal)) # upベクトル計算関数が必要
        
        # 平行投影を有効にして、スケールを調整 (2D的なビューのため)
        plotter.enable_parallel_projection()
        plotter.camera.parallel_scale = radius # 表示範囲の半分程度 (半径)

        # 背景色
        plotter.set_background("white")

        os.makedirs(output_dir, exist_ok=True)
        image_path = os.path.join(output_dir, f"{locator_id}.png")
        
        plotter.screenshot(image_path)
        plotter.close() # プロッターを閉じる
        print(f"PyVista: Saved slice image to {image_path}")
        return True

    except Exception as e:
        print(f"PyVista: Error processing slice for locator {locator_id}: {e}")
        import traceback
        traceback.print_exc()
        return False

def calculate_camera_up_vector(plane_normal):
    """PyVistaのカメラ用にupベクトルを計算するヘルパー"""
    if np.allclose(plane_normal, [0, 0, 1]) or np.allclose(plane_normal, [0, 0, -1]):
        return [0, 1, 0]
    # If normal is Y-axis, set Z as up
    if np.allclose(plane_normal, [0, 1, 0]) or np.allclose(plane_normal, [0, -1, 0]):
        return [0, 0, 1] # or [0,0,-1] depending on desired orientation
    # Otherwise, default to Z-axis as up (if normal is not Z-aligned)
    # or cross product with Z for a robust up vector
    z_axis = np.array([0,0,1])
    up = np.cross(plane_normal, z_axis)
    if np.linalg.norm(up) < 1e-6: # normal is Z-aligned
        up = np.array([0,1,0]) # Use Y as up
    return up / np.linalg.norm(up)


# calculate_plane_normal は既存のものをそのまま使用
def calculate_plane_normal(rx_deg, ry_deg, rz_deg):
    """
    オイラー角 (rx, ry, rz 度数法) から平面の法線ベクトルを計算する。
    Three.jsの 'YXZ' (Tait-Bryan) 順序を想定。
    基準となる法線はZ軸 (0,0,1) とする。
    """
    # Z軸単位ベクトル
    normal_vec = np.array([0.0, 0.0, 1.0])

    # 1. Y軸周りの回転 (ry)
    rad_ry = np.deg2rad(ry_deg)
    rot_mat_y = np.array([
        [np.cos(rad_ry), 0, np.sin(rad_ry)],
        [0, 1, 0],
        [-np.sin(rad_ry), 0, np.cos(rad_ry)]
    ])
    normal_vec = rot_mat_y @ normal_vec

    # 2. X軸周りの回転 (rx)
    rad_rx = np.deg2rad(rx_deg)
    rot_mat_x = np.array([
        [1, 0, 0],
        [0, np.cos(rad_rx), -np.sin(rad_rx)],
        [0, np.sin(rad_rx), np.cos(rad_rx)]
    ])
    normal_vec = rot_mat_x @ normal_vec
    
    norm = np.linalg.norm(normal_vec)
    return normal_vec / norm if norm > 0 else np.array([0.0, 0.0, 1.0])

# process_locators_for_obj 関数を修正して新しいPyVista版関数を呼び出す
def process_locators_for_obj(obj_file_path, locators_data_list, output_dir="data"):
    print(f"PyVista: process_locators_for_obj called for {obj_file_path}")
    # Open3Dのメッシュロードは不要になる
    # mesh = o3d.io.read_triangle_mesh(obj_file_path) ... (この部分はPyVista版では不要)

    results = []
    for loc_data in locators_data_list:
        locator_id = loc_data.get("id", f"unknown_loc_{np.random.randint(1000)}")
        plane_origin = np.array([
            loc_data.get("x", 0.0),
            loc_data.get("y", 0.0),
            loc_data.get("z", 0.0)
        ])
        plane_normal = calculate_plane_normal( # 既存の関数で法線計算
            loc_data.get("rx", 0.0),
            loc_data.get("ry", 0.0),
            loc_data.get("rz", 0.0)
        )
        
        slice_radius = 200.0 # 半径200mm

        # PyVista版の断面生成関数を呼び出す
        if create_slice_image_pyvista(obj_file_path, plane_origin, plane_normal, locator_id, slice_radius, output_dir):
            results.append({"id": locator_id, "status": "success", "image_path": os.path.join(output_dir, f"{locator_id}.png")})
        else:
            results.append({"id": locator_id, "status": "error", "message": f"Failed to create slice image for {locator_id} using PyVista"})
            
    return True, results


# main_test 関数もPyVista版に合わせて修正 (または一旦コメントアウト)
def main_test():
    print("Running PyVista slice_obj.py main_test...")
    cube_mesh_path = os.path.join("data", "test_cube.obj")
    if not os.path.exists(cube_mesh_path):
        # PyVistaは直接立方体を作れるので、OBJファイルがなくてもテスト可能
        # box = pv.Box()
        # box.save(cube_mesh_path)
        # print(f"Saved test cube using PyVista to {cube_mesh_path}")
        # Open3Dで生成した既存のtest_cube.objを使う前提で進める
        # もしなければ、Open3Dのコードで生成する
        print(f"Warning: {cube_mesh_path} not found. Please generate it or provide a valid OBJ.")
        # 簡易的にOpen3Dのコードを呼び出して生成
        import open3d as o3d # main_testでcube生成に使うため
        temp_mesh_o3d = o3d.geometry.TriangleMesh.create_box(width=1.0, height=1.0, depth=1.0)
        o3d.io.write_triangle_mesh(cube_mesh_path, temp_mesh_o3d, write_ascii=True)
        print(f"Generated {cube_mesh_path} using Open3D for PyVista test.")


    locators_data = [
        {"id": "PV_TEST_001", "x": 0.5, "y": 0.5, "z": 0.5, "rx": 0, "ry": 0, "rz": 0},
        {"id": "PV_TEST_002", "x": 0.0, "y": 0.0, "z": 0.5, "rx": 45, "ry": 0, "rz": 0},
        {"id": "PV_TEST_003", "x": 0.5, "y": 0.5, "z": 1.0, "rx": 0, "ry": 45, "rz": 0},
    ]
    output_directory = "data" # 出力先は同じ data/generated_slices を app.py で指定
    
    success, results = process_locators_for_obj(cube_mesh_path, locators_data, output_directory) # output_dirはapp.py側で指定される

    if success: # process_locators_for_obj は常にTrueを返すように変更したので、results内容で判断
        print("PyVista processing attempted.")
        all_successful = True
        for res in results:
            print(f"  Locator {res['id']}: {res['status']}")
            if res['status'] == 'success':
                print(f"    Image: {res['image_path']}")
            else:
                all_successful = False
                print(f"    Error: {res.get('message')}")
        if all_successful:
            print("All PyVista slices generated successfully.")
        else:
            print("Some PyVista slices failed.")
    else: # この分岐には通常入らない
        print("PyVista processing function returned critical error (should not happen with current logic).")

if __name__ == "__main__":
    # Open3Dのインポートも必要になる場合があるので、main_testの先頭に移動するか、
    # main_test内でcube生成にOpen3Dを使うならそのままでOK
    import open3d as o3d # main_testでcube生成に使うため
    main_test()