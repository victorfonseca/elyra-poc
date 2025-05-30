import React, { useState, useEffect } from 'react';
import { Dag, DagRun } from '../types/dag';
import { DagParameters } from '../types/api';
import { MinioObject } from '../types/api';
import { airflowService } from '../services/airflowService';
import { minioService } from '../services/minioService';
import { formatDate, getStatusColor } from '../utils/helpers'; // FIXED: Removed unused formatDuration import
import FileUpload from './FileUpload';
import ParameterForm from './ParameterForm';

interface DagDetailsProps {
  dag: Dag;
  onBack: () => void;
}

const DagDetails: React.FC<DagDetailsProps> = ({ dag, onBack }) => {
  const [dagRuns, setDagRuns] = useState<DagRun[]>([]);
  const [minioFiles, setMinioFiles] = useState<MinioObject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [triggering, setTriggering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // NEW: Parameter form state
  const [showParameterForm, setShowParameterForm] = useState<boolean>(false);
  const [triggerMode, setTriggerMode] = useState<'simple' | 'parameters'>('simple');

  useEffect(() => {
    loadDagData();
  }, [dag.dag_id]);

  const loadDagData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load DAG runs and MinIO files in parallel
      const [runs, files] = await Promise.all([
        airflowService.getDagRuns(dag.dag_id),
        minioService.getDagFiles(dag.dag_id).catch(() => []) // Don't fail if MinIO is not available
      ]);

      setDagRuns(runs);
      setMinioFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DAG details');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // UPDATED: Original simple trigger (kept for backward compatibility)
  const handleTriggerDag = async () => {
    try {
      setTriggering(true);
      await airflowService.triggerDag(dag.dag_id);
      
      setTimeout(() => {
        loadDagData();
      }, 2000);
      
      showNotification('success', 'DAG triggered successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      showNotification('error', `Failed to trigger DAG: ${errorMessage}`);
    } finally {
      setTriggering(false);
    }
  };

  // NEW: Trigger with parameters
  const handleTriggerWithParameters = async (parameters: DagParameters) => {
    try {
      setTriggering(true);
      console.log('Triggering DAG with parameters:', parameters);
      
      await airflowService.triggerDagWithParameters(dag.dag_id, parameters);
      
      // Hide parameter form and refresh data
      setShowParameterForm(false);
      setTimeout(() => {
        loadDagData();
      }, 2000);
      
      showNotification('success', 'DAG triggered successfully with parameters!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      showNotification('error', `Failed to trigger DAG with parameters: ${errorMessage}`);
    } finally {
      setTriggering(false);
    }
  };

  // NEW: Handle trigger button click - show options
  const handleTriggerClick = () => {
    if (triggerMode === 'simple') {
      handleTriggerDag();
    } else {
      setShowParameterForm(true);
    }
  };

  // NEW: Cancel parameter form
  const handleCancelParameters = () => {
    setShowParameterForm(false);
  };

  const handleUploadSuccess = async (fileName: string, fileUrl: string) => {
    showNotification('success', `File "${fileName}" uploaded successfully!`);
    try {
      const files = await minioService.getDagFiles(dag.dag_id);
      setMinioFiles(files);
    } catch (error) {
      console.error('Failed to refresh files:', error);
    }
  };

  const handleUploadError = (error: string) => {
    showNotification('error', `Upload failed: ${error}`);
  };

  if (loading) {
    return (
      <div className="loading">
        <p>Loading DAG details...</p>
      </div>
    );
  }

  return (
    <div className="dag-details">
      <div className="dag-details-header">
        <button onClick={onBack} className="back-btn">
          ← Back to DAGs
        </button>
        <h2>{dag.dag_id}</h2>
        
        {/* UPDATED: Enhanced trigger section */}
        <div className="trigger-section">
          {!showParameterForm && (
            <>
              {/* Trigger Mode Toggle */}
              <div className="trigger-mode-toggle">
                <label>
                  <input
                    type="radio"
                    name="triggerMode"
                    value="simple"
                    checked={triggerMode === 'simple'}
                    onChange={() => setTriggerMode('simple')}
                    disabled={triggering}
                  />
                  Simple
                </label>
                <label>
                  <input
                    type="radio"
                    name="triggerMode"
                    value="parameters"
                    checked={triggerMode === 'parameters'}
                    onChange={() => setTriggerMode('parameters')}
                    disabled={triggering}
                  />
                  With Parameters
                </label>
              </div>
              
              {/* Trigger Button */}
              <button 
                onClick={handleTriggerClick}
                disabled={triggering || dag.is_paused}
                className="trigger-btn"
              >
                {triggering ? 'Triggering...' : 
                 triggerMode === 'simple' ? 'Trigger DAG' : 'Configure & Trigger'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={loadDagData}>Retry</button>
        </div>
      )}

      {notification && (
        <div className={`notification ${notification.type}`}>
          <span>{notification.message}</span>
          <button 
            onClick={() => setNotification(null)}
            className="notification-close"
          >
            ×
          </button>
        </div>
      )}

      {/* NEW: Parameter Form */}
      {showParameterForm && (
        <div className="parameter-form-section">
          <ParameterForm
            dagId={dag.dag_id}
            onSubmit={handleTriggerWithParameters}
            onCancel={handleCancelParameters}
            loading={triggering}
          />
        </div>
      )}

      {/* Existing DAG Info - only show when not in parameter mode */}
      {!showParameterForm && (
        <div className="dag-info">
          <div className="dag-info-section">
            <h3>DAG Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Status:</label>
                <span className={`status ${dag.is_paused ? 'paused' : 'active'}`}>
                  {dag.is_paused ? 'Paused' : 'Active'}
                </span>
              </div>
              <div className="info-item">
                <label>Description:</label>
                <span>{dag.description || 'No description'}</span>
              </div>
              <div className="info-item">
                <label>Owner:</label>
                <span>{dag.owners?.join(', ') || 'N/A'}</span>
              </div>
              <div className="info-item">
                <label>File Location:</label>
                <span>{dag.fileloc}</span>
              </div>
              <div className="info-item">
                <label>Last Parsed:</label>
                <span>{formatDate(dag.last_parsed_time)}</span>
              </div>
              <div className="info-item">
                <label>Next Run:</label>
                <span>{formatDate(dag.next_dagrun)}</span>
              </div>
            </div>
          </div>

          {minioFiles.length > 0 && (
            <div className="minio-files-section">
              <h3>Related Files (MinIO)</h3>
              <div className="files-list">
                {minioFiles.map((file) => (
                  <div key={`${file.name}-${file.lastModified.getTime()}`} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{(file.size / 1024).toFixed(2)} KB</span>
                    <span className="file-date">{formatDate(file.lastModified.toISOString())}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="file-upload-section">
            <h3>Upload Files</h3>
            <FileUpload
              onUploadSuccess={handleUploadSuccess}
              onUploadError={handleUploadError}
              dagId={dag.dag_id}
              allowedTypes={['.py', '.sql', '.json', '.yaml', '.yml', '.txt', '.md']}
              maxFileSize={50}
            />
          </div>

          <div className="dag-runs-section">
            <h3>Recent DAG Runs ({dagRuns.length})</h3>
            {dagRuns.length === 0 ? (
              <p>No DAG runs found</p>
            ) : (
              <div className="runs-table-container">
                <table className="runs-table">
                  <thead>
                    <tr>
                      <th>Run ID</th>
                      <th>State</th>
                      <th>Execution Date</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>External Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dagRuns.map((run) => (
                      <tr key={`${run.dag_id}-${run.dag_run_id}-${run.execution_date}`}>
                        <td>{run.dag_run_id}</td>
                        <td>
                          <span 
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(run.state) }}
                          >
                            {run.state}
                          </span>
                        </td>
                        <td>{formatDate(run.execution_date)}</td>
                        <td>{formatDate(run.start_date)}</td>
                        <td>{formatDate(run.end_date)}</td>
                        <td>{run.external_trigger ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DagDetails;