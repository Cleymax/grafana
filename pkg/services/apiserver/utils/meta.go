package utils

import (
	"fmt"
	"reflect"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

// Annotation keys

const AnnoKeyCreatedBy = "grafana.app/createdBy"
const AnnoKeyUpdatedTimestamp = "grafana.app/updatedTimestamp"
const AnnoKeyUpdatedBy = "grafana.app/updatedBy"
const AnnoKeyFolder = "grafana.app/folder"
const AnnoKeySlug = "grafana.app/slug"

// Identify where values came from

const AnnoKeyOriginName = "grafana.app/originName"
const AnnoKeyOriginPath = "grafana.app/originPath"
const AnnoKeyOriginHash = "grafana.app/originHash"
const AnnoKeyOriginTimestamp = "grafana.app/originTimestamp"

// ResourceOriginInfo is saved in annotations.  This is used to identify where the resource came from
// This object can model the same data as our existing provisioning table or a more general git sync
type ResourceOriginInfo struct {
	// Name of the origin/provisioning source
	Name string `json:"name,omitempty"`

	// The path within the named origin above (external_id in the existing dashboard provisioing)
	Path string `json:"path,omitempty"`

	// Verification/identification key (check_sum in existing dashboard provisioning)
	Hash string `json:"hash,omitempty"`

	// Origin modification timestamp when the resource was saved
	// This will be before the resource updated time
	Timestamp *time.Time `json:"time,omitempty"`

	// Avoid extending
	_ any `json:"-"`
}

// Accessor functions for k8s objects
type GrafanaMetaAccessor interface {
	metav1.Object

	GetAPIVersion() string
	GetKind() string

	GetUpdatedTimestamp() (*time.Time, error)
	SetUpdatedTimestamp(v *time.Time)
	SetUpdatedTimestampMillis(unix int64)
	GetCreatedBy() string
	SetCreatedBy(user string)
	GetUpdatedBy() string
	SetUpdatedBy(user string)
	GetFolder() string
	SetFolder(uid string)
	GetSlug() string
	SetSlug(v string)

	GetOriginInfo() (*ResourceOriginInfo, error)
	SetOriginInfo(info *ResourceOriginInfo)
	GetOriginName() string
	GetOriginPath() string
	GetOriginHash() string
	GetOriginTimestamp() (*time.Time, error)

	// Find a title in the object
	// This will reflect the object and try to get:
	//  * spec.title
	//  * spec.name
	//  * title
	// and return an empty string if nothing was found
	FindTitle(defaultTitle string) string
}

var _ GrafanaMetaAccessor = (*grafanaMetaAccessor)(nil)

type grafanaMetaAccessor struct {
	raw interface{} // the original object (it implements metav1.Object)
	obj metav1.Object
	typ metav1.Type
}

// Accessor takes an arbitrary object pointer and returns meta.Interface.
// obj must be a pointer to an API type. An error is returned if the minimum
// required fields are missing. Fields that are not required return the default
// value and are a no-op if set.
func MetaAccessor(raw interface{}) (GrafanaMetaAccessor, error) {
	obj, err := meta.Accessor(raw)
	if err != nil {
		return nil, err
	}
	typ, ok := raw.(metav1.Type)
	if !ok {
		typ, ok = obj.(metav1.Type)
		if !ok {
			typ = nil
		}
	}
	return &grafanaMetaAccessor{raw, obj, typ}, nil
}

func (m *grafanaMetaAccessor) Object() metav1.Object {
	return m.obj
}

func (m *grafanaMetaAccessor) set(key string, val string) {
	anno := m.obj.GetAnnotations()
	if val == "" {
		if anno != nil {
			delete(anno, key)
		}
	} else {
		if anno == nil {
			anno = make(map[string]string)
		}
		anno[key] = val
	}
	m.obj.SetAnnotations(anno)
}

func (m *grafanaMetaAccessor) get(key string) string {
	return m.obj.GetAnnotations()[key]
}

func (m *grafanaMetaAccessor) GetUpdatedTimestamp() (*time.Time, error) {
	v, ok := m.obj.GetAnnotations()[AnnoKeyUpdatedTimestamp]
	if !ok || v == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return nil, fmt.Errorf("invalid updated timestamp: %s", err.Error())
	}
	t = t.UTC()
	return &t, nil
}

func (m *grafanaMetaAccessor) SetUpdatedTimestampMillis(v int64) {
	if v > 0 {
		t := time.UnixMilli(v)
		m.SetUpdatedTimestamp(&t)
	} else {
		m.set(AnnoKeyUpdatedTimestamp, "") // will clear the annotation
	}
}

func (m *grafanaMetaAccessor) SetUpdatedTimestamp(v *time.Time) {
	txt := ""
	if v != nil && v.Unix() != 0 {
		txt = v.UTC().Format(time.RFC3339)
	}
	m.set(AnnoKeyUpdatedTimestamp, txt)
}

func (m *grafanaMetaAccessor) GetCreatedBy() string {
	return m.get(AnnoKeyCreatedBy)
}

func (m *grafanaMetaAccessor) SetCreatedBy(user string) {
	m.set(AnnoKeyCreatedBy, user)
}

func (m *grafanaMetaAccessor) GetUpdatedBy() string {
	return m.get(AnnoKeyUpdatedBy)
}

func (m *grafanaMetaAccessor) SetUpdatedBy(user string) {
	m.set(AnnoKeyUpdatedBy, user)
}

func (m *grafanaMetaAccessor) GetFolder() string {
	return m.get(AnnoKeyFolder)
}

func (m *grafanaMetaAccessor) SetFolder(uid string) {
	m.set(AnnoKeyFolder, uid)
}

func (m *grafanaMetaAccessor) GetSlug() string {
	return m.get(AnnoKeySlug)
}

func (m *grafanaMetaAccessor) SetSlug(v string) {
	m.set(AnnoKeySlug, v)
}

func (m *grafanaMetaAccessor) SetOriginInfo(info *ResourceOriginInfo) {
	anno := m.obj.GetAnnotations()
	if anno == nil {
		if info == nil {
			return
		}
		anno = make(map[string]string, 0)
	}

	delete(anno, AnnoKeyOriginName)
	delete(anno, AnnoKeyOriginPath)
	delete(anno, AnnoKeyOriginHash)
	delete(anno, AnnoKeyOriginTimestamp)
	if info != nil && info.Name != "" {
		anno[AnnoKeyOriginName] = info.Name
		if info.Path != "" {
			anno[AnnoKeyOriginPath] = info.Path
		}
		if info.Hash != "" {
			anno[AnnoKeyOriginHash] = info.Hash
		}
		if info.Timestamp != nil {
			anno[AnnoKeyOriginTimestamp] = info.Timestamp.UTC().Format(time.RFC3339)
		}
	}
	m.obj.SetAnnotations(anno)
}

func (m *grafanaMetaAccessor) GetOriginInfo() (*ResourceOriginInfo, error) {
	v, ok := m.obj.GetAnnotations()[AnnoKeyOriginName]
	if !ok {
		return nil, nil
	}
	t, err := m.GetOriginTimestamp()
	return &ResourceOriginInfo{
		Name:      v,
		Path:      m.GetOriginPath(),
		Hash:      m.GetOriginHash(),
		Timestamp: t,
	}, err
}

func (m *grafanaMetaAccessor) GetOriginName() string {
	return m.get(AnnoKeyOriginName)
}

func (m *grafanaMetaAccessor) GetOriginPath() string {
	return m.get(AnnoKeyOriginPath)
}

func (m *grafanaMetaAccessor) GetOriginHash() string {
	return m.get(AnnoKeyOriginHash)
}

func (m *grafanaMetaAccessor) GetOriginTimestamp() (*time.Time, error) {
	v, ok := m.obj.GetAnnotations()[AnnoKeyOriginTimestamp]
	if !ok || v == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return nil, fmt.Errorf("invalid origin timestamp: %s", err.Error())
	}
	return &t, nil
}

// GetAnnotations implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetAnnotations() map[string]string {
	return m.obj.GetAnnotations()
}

// GetCreationTimestamp implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetCreationTimestamp() metav1.Time {
	return m.obj.GetCreationTimestamp()
}

// GetDeletionGracePeriodSeconds implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetDeletionGracePeriodSeconds() *int64 {
	return m.obj.GetDeletionGracePeriodSeconds()
}

// GetDeletionTimestamp implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetDeletionTimestamp() *metav1.Time {
	return m.obj.GetDeletionTimestamp()
}

// GetFinalizers implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetFinalizers() []string {
	return m.obj.GetFinalizers()
}

// GetGenerateName implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetGenerateName() string {
	return m.obj.GetGenerateName()
}

// GetGeneration implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetGeneration() int64 {
	return m.obj.GetGeneration()
}

// GetLabels implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetLabels() map[string]string {
	return m.obj.GetLabels()
}

// GetManagedFields implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetManagedFields() []metav1.ManagedFieldsEntry {
	return m.obj.GetManagedFields()
}

// GetName implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetName() string {
	return m.obj.GetName()
}

// GetNamespace implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetNamespace() string {
	return m.obj.GetNamespace()
}

// GetOwnerReferences implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetOwnerReferences() []metav1.OwnerReference {
	return m.obj.GetOwnerReferences()
}

// GetResourceVersion implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetResourceVersion() string {
	return m.obj.GetResourceVersion()
}

// GetSelfLink implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetSelfLink() string {
	return m.obj.GetSelfLink()
}

// GetUID implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) GetUID() types.UID {
	return m.obj.GetUID()
}

// SetAnnotations implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetAnnotations(annotations map[string]string) {
	m.obj.SetAnnotations(annotations)
}

// SetCreationTimestamp implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetCreationTimestamp(timestamp metav1.Time) {
	m.obj.SetCreationTimestamp(timestamp)
}

// SetDeletionGracePeriodSeconds implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetDeletionGracePeriodSeconds(v *int64) {
	m.obj.SetDeletionGracePeriodSeconds(v)
}

// SetDeletionTimestamp implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetDeletionTimestamp(timestamp *metav1.Time) {
	m.obj.SetDeletionTimestamp(timestamp)
}

// SetFinalizers implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetFinalizers(finalizers []string) {
	m.obj.SetFinalizers(finalizers)
}

// SetGenerateName implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetGenerateName(name string) {
	m.obj.SetGenerateName(name)
}

// SetGeneration implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetGeneration(generation int64) {
	m.obj.SetGeneration(generation)
}

// SetLabels implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetLabels(labels map[string]string) {
	m.obj.SetLabels(labels)
}

// SetManagedFields implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetManagedFields(managedFields []metav1.ManagedFieldsEntry) {
	m.obj.SetManagedFields(managedFields)
}

// SetName implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetName(name string) {
	m.obj.SetName(name)
}

// SetNamespace implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetNamespace(namespace string) {
	m.obj.SetNamespace(namespace)
}

// SetOwnerReferences implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetOwnerReferences(v []metav1.OwnerReference) {
	m.obj.SetOwnerReferences(v)
}

// SetResourceVersion implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetResourceVersion(version string) {
	m.obj.SetResourceVersion(version)
}

// SetSelfLink implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetSelfLink(selfLink string) {
	m.obj.SetSelfLink(selfLink)
}

// SetUID implements GrafanaMetaAccessor.
func (m *grafanaMetaAccessor) SetUID(uid types.UID) {
	m.obj.SetUID(uid)
}

func (m *grafanaMetaAccessor) GetAPIVersion() string {
	if m.typ == nil {
		return ""
	}
	return m.typ.GetAPIVersion()
}

func (m *grafanaMetaAccessor) GetKind() string {
	if m.typ == nil {
		return ""
	}
	return m.typ.GetKind()
}

func (m *grafanaMetaAccessor) FindTitle(defaultTitle string) string {
	// look for Spec.Title or Spec.Name
	r := reflect.ValueOf(m.raw)
	if r.Kind() == reflect.Ptr || r.Kind() == reflect.Interface {
		r = r.Elem()
	}
	if r.Kind() == reflect.Struct {
		spec := r.FieldByName("Spec")
		if spec.Kind() == reflect.Struct {
			title := spec.FieldByName("Title")
			if title.IsValid() && title.Kind() == reflect.String {
				return title.String()
			}
			name := spec.FieldByName("Name")
			if name.IsValid() && name.Kind() == reflect.String {
				return name.String()
			}
		}

		title := r.FieldByName("Title")
		if title.IsValid() && title.Kind() == reflect.String {
			return title.String()
		}
	}
	return defaultTitle
}
