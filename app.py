from flask import Flask, request, jsonify
from flask_cors import CORS # 追加
import os
import numpy as np # For potential future use, or if slice_obj needs it indirectly
from slice_obj import process_locators_for_obj # Refactored function
import open3d as o3d # o3d.io.read_triangle_mesh をここで使う場合、または slice_obj 内で完結させる

app = Flask(__name__)
CORS(app) # 追加: これで全てのルートでCORSが有効になります

@app.route('/slice', methods=['POST'])
def slice_model_endpoint(): # Renamed to avoid conflict with potential local var
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        obj_file_path_input = data.get('obj_file_path') # Path from client
        locators_data = data.get('locators')

        if not obj_file_path_input or not locators_data:
            return jsonify({"error": "Missing obj_file_path or locators_data"}), 400

        # Construct absolute path or path relative to a known base directory
        # For simplicity, assume obj_file_path_input can be relative to project root or an absolute path
        # More robust path handling might be needed for production (e.g., uploads folder)
        
        # Check if the path is absolute, if not, assume it's relative to the project's 'data' folder or root
        if not os.path.isabs(obj_file_path_input):
            # Try relative to project root first
            path_from_root = os.path.join(os.path.dirname(__file__), obj_file_path_input)
            # Then try relative to 'data' directory within project root
            path_from_data_dir = os.path.join(os.path.dirname(__file__), 'data', obj_file_path_input)
            
            if os.path.exists(path_from_root):
                obj_file_path_actual = path_from_root
            elif os.path.exists(path_from_data_dir):
                obj_file_path_actual = path_from_data_dir
            else:
                 return jsonify({"error": f"OBJ file not found at '{obj_file_path_input}', '{path_from_root}', or '{path_from_data_dir}'"}), 404
        else:
            if os.path.exists(obj_file_path_input):
                obj_file_path_actual = obj_file_path_input
            else:
                return jsonify({"error": f"OBJ file not found at absolute path: {obj_file_path_input}"}), 404

        app.logger.info(f"Attempting to process OBJ file: {obj_file_path_actual}")
        app.logger.info(f"Received {len(locators_data)} locators.")

        # Define output directory for images (e.g., 'data/generated_slices')
        output_image_dir = os.path.join(os.path.dirname(__file__), "data", "generated_slices")
        os.makedirs(output_image_dir, exist_ok=True)
        
        # Call the refactored processing function
        success, results = process_locators_for_obj(obj_file_path_actual, locators_data, output_image_dir)

        if success:
            return jsonify({
                "message": f"Slicing process completed for {os.path.basename(obj_file_path_actual)}.",
                "obj_file_processed": obj_file_path_actual,
                "num_locators_processed": len(locators_data),
                "slice_results": results
            }), 200
        else:
            # If process_locators_for_obj returns False, it means there was a critical error (e.g., mesh load failed)
            # The 'results' list might contain more specific error messages per locator.
            return jsonify({
                "error": "Slicing process encountered errors.",
                "obj_file_processed": obj_file_path_actual,
                "details": results # results will contain error messages
            }), 500

    except Exception as e:
        app.logger.error(f"Unhandled error in /slice endpoint: {e}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)