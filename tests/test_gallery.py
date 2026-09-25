import os
import json
import io
import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
from PIL import Image

# Import app modules
from app import (
    _get_date_from_filename,
    _extract_image_metadata,
    process_single_object,
    _load_existing_cache_map,
    create_app,
    API_CACHE_FILE
)

class TestGalleryPipeline(unittest.TestCase):

    def test_get_date_from_filename_patterns(self):
        # Pattern 1: YYYYMMDD_HHMMSS
        d1 = _get_date_from_filename("PXL_20250810_155214082.jpg")
        self.assertIsNotNone(d1)
        self.assertEqual(d1.year, 2025)
        self.assertEqual(d1.month, 8)
        self.assertEqual(d1.day, 10)
        self.assertEqual(d1.hour, 15)
        self.assertEqual(d1.minute, 52)
        self.assertEqual(d1.second, 14)

        # Pattern 2: YYYY-MM-DD
        d2 = _get_date_from_filename("photo-2024-11-20.jpg")
        self.assertIsNotNone(d2)
        self.assertEqual(d2.year, 2024)
        self.assertEqual(d2.month, 11)
        self.assertEqual(d2.day, 20)

        # Non-matching
        d3 = _get_date_from_filename("10.jpg")
        self.assertIsNone(d3)

    def test_process_single_object_fallback_to_last_modified(self):
        obj = {
            'Key': 'test_without_date.jpg',
            'LastModified': datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        }
        with patch('app._extract_image_metadata') as mock_meta:
            mock_meta.return_value = {'date': None, 'width': 1920, 'height': 1080}
            result = process_single_object(obj, 'test-bucket')
            self.assertEqual(result['Key'], 'test_without_date.jpg')
            self.assertEqual(result['width'], 1920)
            self.assertEqual(result['height'], 1080)
            self.assertIn('2025-01-15', result['sort_date'])

    def test_process_single_object_with_exif_date_precedence(self):
        obj = {
            'Key': 'PXL_20250810_155214082.jpg',
            'LastModified': datetime(2025, 9, 1, 10, 0, 0, tzinfo=timezone.utc)
        }
        exif_dt = datetime(2025, 8, 10, 15, 52, 14)
        with patch('app._extract_image_metadata') as mock_meta:
            mock_meta.return_value = {'date': exif_dt, 'width': 4000, 'height': 3000}
            result = process_single_object(obj, 'test-bucket')
            self.assertEqual(result['width'], 4000)
            self.assertEqual(result['height'], 3000)
            self.assertEqual(result['sort_date'], exif_dt.isoformat())

    def test_incremental_cache_avoids_reprocessing(self):
        # Create a mock cache on disk
        test_cache = {
            'objects': [
                {
                    'Key': 'already_cached.jpg',
                    'LastModified': '2025-08-01T12:00:00+00:00',
                    'sort_date': '2025-08-01T12:00:00',
                    'width': 2000,
                    'height': 1500
                }
            ]
        }
        
        with patch('app._load_existing_cache_map', return_value={'already_cached.jpg': test_cache['objects'][0]}):
            with patch('app.s3_client') as mock_s3:
                # Mock list_objects_v2 returning the already cached object + 1 new object
                paginator_mock = MagicMock()
                mock_s3.get_paginator.return_value = paginator_mock
                paginator_mock.paginate.return_value = [
                    {
                        'Contents': [
                            {
                                'Key': 'already_cached.jpg',
                                'LastModified': datetime(2025, 8, 1, 12, 0, 0, tzinfo=timezone.utc)
                            },
                            {
                                'Key': 'new_photo.jpg',
                                'LastModified': datetime(2025, 9, 20, 10, 0, 0, tzinfo=timezone.utc)
                            }
                        ]
                    }
                ]
                
                with patch('app.process_single_object') as mock_process:
                    mock_process.return_value = {
                        'Key': 'new_photo.jpg',
                        'LastModified': '2025-09-20T10:00:00+00:00',
                        'sort_date': '2025-09-20T10:00:00',
                        'width': 3000,
                        'height': 2000
                    }
                    with patch('builtins.open', unittest.mock.mock_open()) as mock_file:
                        with patch('os.replace'):
                            from app import _build_photo_cache
                            results = _build_photo_cache('test-bucket')

                            # Verify process_single_object was called ONLY for new_photo.jpg, NOT for already_cached.jpg!
                            self.assertEqual(mock_process.call_count, 1)
                            self.assertEqual(mock_process.call_args[0][0]['Key'], 'new_photo.jpg')
                            self.assertEqual(len(results), 2)

    def test_extract_image_metadata_range_fallback(self):
        # Create a small valid test JPEG in memory
        img = Image.new('RGB', (800, 600), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        valid_jpeg_data = img_bytes.getvalue()

        with patch('app.s3_client') as mock_s3:
            # 1. 512KB attempt returns valid image data
            mock_s3.get_object.return_value = {
                'Body': io.BytesIO(valid_jpeg_data)
            }
            meta = _extract_image_metadata('test-bucket', 'sample.jpg')
            self.assertEqual(meta['width'], 800)
            self.assertEqual(meta['height'], 600)

    def test_flask_app_routes(self):
        # Test basic Flask routes with mocked S3 client
        app = create_app()
        app.config['TESTING'] = True
        client = app.test_client()

        # Test index page
        res = client.get('/')
        self.assertEqual(res.status_code, 200)
        self.assertIn(b'<!DOCTYPE html>', res.data)

        # Test /api/photos with mocked cache
        mock_objects = [
            {
                'Key': 'photo1.jpg',
                'LastModified': '2025-08-01T12:00:00+00:00',
                'sort_date': '2025-08-01T12:00:00',
                'width': 1920,
                'height': 1080
            }
        ]
        with patch('os.path.exists', return_value=True):
            with patch('os.path.getmtime', return_value=datetime.now().timestamp()):
                with patch('builtins.open', unittest.mock.mock_open(read_data=json.dumps({'objects': mock_objects}))):
                    with patch('app.s3_client') as mock_s3:
                        mock_s3.generate_presigned_url.return_value = "https://s3.example.com/photo1.jpg"
                        res_photos = client.get('/api/photos')
                        self.assertEqual(res_photos.status_code, 200)
                        data = res_photos.get_json()
                        self.assertEqual(len(data), 1)
                        self.assertEqual(data[0]['key'], 'photo1.jpg')
                        self.assertEqual(data[0]['width'], 1920)
                        self.assertEqual(data[0]['height'], 1080)
                        self.assertIn('no-store', res_photos.headers.get('Cache-Control', ''))

if __name__ == '__main__':
    unittest.main()
